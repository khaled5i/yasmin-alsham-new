// Actual paid API handlers and auth, synthetic Supabase/provider responses only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const next = require('next/server')
const root = path.resolve(__dirname, '..')
const routes = ['translate-text', 'generate-design-prompt', 'generate-design-image',
  'convert-to-cartoon', 'remove-model', 'spatial-ocr', 'transcribe-audio']
let identity, providerCalls, bodyReads, rpcCalls, budget
const userId = 'aaaaaaaa-0000-4000-8000-000000000001'
const syntheticSession = 'synthetic-staff-session'
const client = {
  auth: { async getUser(token) {
    assert.equal(token, syntheticSession)
    return identity.valid === false ? { data: { user: null }, error: {} }
      : { data: { user: { id: userId } }, error: null }
  } },
  from(table) {
    assert.equal(table, 'users')
    const query = { select() { return query }, eq(column, id) {
      assert.equal(column, 'id'); assert.equal(id, userId); return query
    }, async single() { return { data: identity.profileMissing ? null
      : { role: identity.role, is_active: identity.active, email: null }, error: null } } }
    return query
  },
  async rpc(name, args) {
    assert.equal(name, 'staff_ai_take_request_budget')
    assert.equal(args.p_user_id, userId)
    assert(routes.includes(args.p_operation))
    rpcCalls++
    if (budget === 'throw') throw Error('synthetic RPC failure')
    if (budget === 'missing') return { data: null, error: { code: 'PGRST202' } }
    return { data: budget, error: null }
  },
}
class OfflineOpenAI {
  chat = { completions: { create: async () => {
    providerCalls++; return { choices: [{ message: { content: 'translated' } }] }
  } } }
  audio = { transcriptions: { create: async () => { providerCalls++; return { text: 'audio result' } } } }
}
function loader() {
  const cache = new Map()
  return function load(relative) {
    if (cache.has(relative)) return cache.get(relative)
    const filename = path.join(root, 'src', relative + '.ts')
    const exports = {}; cache.set(relative, exports)
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const localRequire = name => {
      if (name === '@supabase/supabase-js') return { createClient: () => client }
      if (name === 'openai') return OfflineOpenAI
      if (name.startsWith('@/')) return load(name.slice(2))
      if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), name))
      return require(name)
    }
    new Function('exports', 'require', 'module', output)(exports, localRequire, { exports })
    return exports
  }
}
function request(route, authenticated = false) {
  const req = new next.NextRequest(`https://test.example.invalid/api/${route}/`, {
    method: 'POST', headers: authenticated ? { authorization: `Bearer ${syntheticSession}` } : {},
  })
  req.json = async () => { bodyReads++; return route === 'translate-text'
    ? { text: 'hello', targetLanguage: 'en' }
    : { enhancedPrompt: 'synthetic design', fabricImages: [], fabricInfo: { fabric: 'synthetic', fabricType: null },
      completedImage: 'data:image/png;base64,bG9jYWw=', imageBase64: 'bG9jYWw=', imageData: 'bG9jYWw=' } }
  req.formData = async () => {
    bodyReads++; const form = new FormData()
    form.set('audio', new File(['synthetic audio'], 'local.webm', { type: 'audio/webm' }))
    return form
  }
  return req
}
function reset() { providerCalls = 0; bodyReads = 0; rpcCalls = 0 }
async function main() {
  const savedEnv = { ...process.env }; const savedFetch = global.fetch
  try {
    Object.assign(process.env, { OPENAI_API_KEY: 'synthetic', OPENROUTER_API_KEY: 'synthetic',
      GOOGLE_CLOUD_VISION_API_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.example.invalid', STAFF_AI_RATE_LIMIT_ENABLED: 'false' })
    global.fetch = async url => {
      assert(/^https:\/\/(openrouter\.ai|vision\.googleapis\.com)\//.test(url), 'only simulated provider calls')
      providerCalls++
      const payload = url.includes('vision.googleapis.com') ? { responses: [{ textAnnotations: [] }] }
        : { choices: [{ message: { content: 'synthetic design prompt',
          parts: [{ inlineData: { mimeType: 'image/png', data: 'bG9jYWw=' } }] } }] }
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const load = loader()
    const handlers = routes.map(route => [route, load(`app/api/${route}/route`).POST])
    let scenarios = 0
    for (const [route, handler] of handlers) {
      for (const [caseName, profile, authenticated, expected] of [
        ['no session', {}, false, 401], ['invalid token', { valid: false }, true, 401],
        ['inactive admin', { role: 'admin', active: false }, true, 403],
        ['inactive worker', { role: 'worker', active: false }, true, 403],
        ['customer', { role: 'customer', active: true }, true, 403],
        ['profile missing', { profileMissing: true }, true, 403],
      ]) {
        identity = profile; reset()
        const response = await handler(request(route, authenticated))
        assert.equal(response.status, expected, `${route}: ${caseName}; provider calls=${providerCalls}`)
        assert.equal(providerCalls, 0); assert.equal(bodyReads, 0); assert.equal(rpcCalls, 0)
        scenarios++
      }
      for (const role of ['admin', 'worker']) {
        identity = { role, active: true }; reset()
        const response = await handler(request(route, true))
        assert.equal(bodyReads, 1, `${route}: ${role} can reach the original handler`)
        assert.equal(rpcCalls, 0, 'distributed quota is off by default')
        assert.equal(response.status, 200, `${route}: ${role} still returns the original success`)
        assert.equal(providerCalls, 1)
        if (route === 'translate-text') {
          assert.equal(response.status, 200); assert.equal(providerCalls, 1)
          assert.equal((await response.json()).translatedText, 'translated')
        }
        scenarios++
      }
      process.env.STAFF_AI_RATE_LIMIT_ENABLED = 'true'
      for (const [result, expected] of [
        [{ status: 'rate_limited', retry_after_seconds: 123 }, 429],
        [{ status: 'forbidden' }, 403], ['missing', 503], ['throw', 503],
        [{ status: 'unexpected' }, 503],
      ]) {
        budget = result; identity = { role: 'admin', active: true }; reset()
        const response = await handler(request(route, true))
        assert.equal(response.status, expected, `${route}: quota ${JSON.stringify(result)}`)
        assert.equal(providerCalls, 0); assert.equal(bodyReads, 0); assert.equal(rpcCalls, 1)
        if (expected === 429) assert.equal(response.headers.get('Retry-After'), '123')
        scenarios++
      }
      budget = { status: 'allowed' }; reset()
      assert.equal((await handler(request(route, true))).status, 200)
      assert.equal(bodyReads, 1); assert.equal(rpcCalls, 1)
      scenarios++
      process.env.STAFF_AI_RATE_LIMIT_ENABLED = 'false'
    }
    console.log(`PASS ${scenarios} actual route/auth/quota cases; all provider calls replaced locally`)

    // Evaluate the actual headers objects at every current consumer.
    const consumers = ['src/components/InteractiveImageAnnotation.tsx', 'src/components/OrderModal.tsx',
      'src/components/OrderAlterationsSection.tsx', 'src/components/GenerateDesignButton.tsx',
      'src/components/VoiceNotes.tsx', 'src/components/UnifiedNotesInput.tsx',
      'src/app/dashboard/add-order/page.tsx', 'src/lib/services/alteration-slip-printer.ts']
    let checked = 0
    for (const file of consumers) {
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const objects = []
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'fetch' &&
          ts.isStringLiteral(node.arguments[0]) &&
          routes.some(route => node.arguments[0].text === `/api/${route}` || node.arguments[0].text === `/api/${route}/`)) {
          assert(ts.isObjectLiteralExpression(node.arguments[1]), `${file}: fetch options`)
          const property = node.arguments[1].properties.find(p => p.name?.getText(ast) === 'headers')
          assert(property && ts.isPropertyAssignment(property), `${file}: authorization headers required`)
          objects.push(property.initializer.getText(ast))
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
      for (const expression of objects) {
        const headers = await new Function('getAuthHeader', `return (async () => (${expression}))()`)(
          async () => ({ Authorization: `Bearer ${syntheticSession}` }))
        assert.equal(headers.Authorization, `Bearer ${syntheticSession}`, file)
        assert.equal(headers['Content-Type'], 'application/json', file)
        checked++
      }
    }
    assert.equal(checked, 14, 'inventory of all current browser consumers')
    console.log(`PASS ${checked} real client header expressions preserve JSON and attach the session`)
  } finally { process.env = savedEnv; global.fetch = savedFetch }
}
main().catch(error => { console.error(`FAIL ${error.stack}`); process.exit(1) })
