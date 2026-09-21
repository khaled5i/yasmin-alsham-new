// Offline regression tests: actual hook/component functions, mocked browser and provider.
// Run: node --test scripts/test-voice-note-transcription.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

function harness({ convert = async blob => blob, fetcher, session = () => true } = {}) {
  let cleanup, busy = false, ids = new Set()
  const timers = new Set(), calls = []
  const exports = {}
  const react = {
    useRef: current => ({ current }),
    useState: initial => [initial, next => { ids = next }],
    useEffect: effect => { cleanup = effect() },
  }
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/hooks/useVoiceNoteTranscription.ts'), 'utf8')), {
    exports, require: name => ({ react, '@/lib/audio-utils': { recordingBlobToWav: convert },
      '@/lib/client-auth': { getAuthHeader: async () => ({ Authorization: 'Bearer synthetic' }) } })[name],
    FormData, AbortController,
    fetch: async (url, options) => {
      calls.push({ url, options })
      return fetcher ? fetcher(url, options) : { ok: true, json: async () => ({ text: 'result<end>' }) }
    },
    setTimeout: cb => { timers.add(cb); return cb }, clearTimeout: cb => timers.delete(cb),
  })
  const hook = exports.useVoiceNoteTranscription(value => { busy = value }, session)
  return { hook, calls, cleanup: () => cleanup(), busy: () => busy, ids: () => ids,
    timeout: () => { for (const cb of timers) cb() } }
}
const audio = () => new Blob(['audio'], { type: 'audio/webm' })

function initializer(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let result
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast)
    ts.forEachChild(node, walk)
  }
  walk(ast)
  assert.ok(result, `${file}: ${name} exists`)
  return result
}

const saveForms = [
  ['src/app/dashboard/add-order/page.tsx', ['handleSubmit', 'handleSubmitAndSendWhatsApp', 'handleSubmitAsPreBooking', 'handleSubmitAndPrint']],
  ['src/components/EditOrderModal.tsx', ['handleSubmit', 'handleSubmitAndSendWhatsApp']],
  ['src/app/dashboard/alterations/add/page.tsx', ['handleSubmit', 'handleSubmitAndSendWhatsApp']],
]
for (const [file, handlers] of saveForms) for (const handler of handlers) {
  test(`${file}: ${handler} refuses saving a pending recording`, async () => {
    let warning = ''
    const context = {
      useCallback: fn => fn, voiceBusyRef: { current: true }, errorVoiceBusyRef: { current: false },
      annotationRef: { current: null }, isSubmittingRef: { current: false },
      requireBasicInformation: () => true, requireDesignSummary: () => true,
      formData: { clientName: 'Test', clientPhone: 'synthetic', price: 1, dueDate: 'synthetic', hasSecondProof: 'no', hasShakWork: 'no', errorType: 'test' },
      order: { id: 'synthetic' }, effectiveOrderId: 'synthetic', isArabic: true,
      setSaveError: text => { warning = text }, toast: { error: text => { warning = text } },
      setIsSubmitting: () => assert.fail('saving began before transcription finished'),
    }
    if (file.includes('add-order')) {
      vm.runInNewContext(compile('globalThis.requireTranscriptionDone = ' + initializer(file, 'requireTranscriptionDone')), context)
    }
    vm.runInNewContext(compile('globalThis.submit = ' + initializer(file, handler)), context)
    await context.submit({ preventDefault() {} })
    assert.ok(warning.includes('تحويل'))
    if (file.includes('alterations')) {
      context.voiceBusyRef.current = false; context.errorVoiceBusyRef.current = true; warning = ''
      await context.submit({ preventDefault() {} })
      assert.ok(warning.includes('تحويل'))
    }
  })
}

test('recording and fallback keep saving blocked until the result is accepted', async () => {
  const h = harness(); h.hook.beginRecording(); assert.equal(h.busy(), true)
  let accepted
  const job = h.hook.transcribe('a', audio(), text => { assert.equal(h.busy(), true); accepted = text })
  h.hook.finishRecording(); assert.equal(h.busy(), true)
  await job
  assert.equal(accepted, 'result'); assert.equal(h.busy(), false)
  assert.equal(h.calls[0].url, '/api/soniox-async-transcribe/')
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer synthetic')
  assert.equal(h.calls[0].options.body.get('audio').name, 'recording.wav')
})

test('deletion during conversion avoids even issuing the paid request', async () => {
  const gate = deferred(), h = harness({ convert: () => gate.promise })
  const job = h.hook.transcribe('a', audio(), () => assert.fail('deleted note accepted'))
  h.hook.cancel('a'); gate.resolve(audio()); await job
  assert.equal(h.calls.length, 0); assert.equal(h.busy(), false)
})

for (const reason of ['delete', 'unmount', 'closed-session', 'timeout']) {
  test(`${reason} ignores a response even when the transport ignores abort`, async () => {
    const gate = deferred(); let open = true
    const h = harness({ fetcher: () => gate.promise, session: () => open })
    const job = h.hook.transcribe('a', audio(), () => assert.fail('stale result accepted'))
    await new Promise(resolve => setImmediate(resolve))
    if (reason === 'delete') h.hook.cancel('a')
    if (reason === 'unmount') h.cleanup()
    if (reason === 'closed-session') open = false
    if (reason === 'timeout') h.timeout()
    gate.resolve({ ok: true, json: async () => ({ text: 'late' }) }); await job
    if (reason !== 'closed-session') assert.equal(h.busy(), false)
  })
}

test('a failed provider leaves the note untouched and releases saving', async () => {
  const h = harness({ fetcher: async () => ({ ok: false, json: async () => ({}) }) })
  await h.hook.transcribe('a', audio(), () => assert.fail('failure accepted'))
  assert.equal(h.busy(), false); assert.equal(h.ids().size, 0)
})

test('failed WAV conversion sends the original recording', async () => {
  const h = harness({ convert: async () => { throw Error('decode') } })
  await h.hook.transcribe('a', audio(), () => {})
  assert.equal(h.calls[0].options.body.get('audio').name, 'recording.webm')
})

test('one finished request cannot unlock saving while another is pending', async () => {
  const gate = deferred(); let count = 0
  const h = harness({ fetcher: async () => ++count === 1 ? gate.promise : { ok: true, json: async () => ({ text: 'b' }) } })
  const first = h.hook.transcribe('a', audio(), () => {})
  await new Promise(resolve => setImmediate(resolve))
  await h.hook.transcribe('b', audio(), () => {})
  assert.equal(h.busy(), true)
  gate.resolve({ ok: true, json: async () => ({ text: 'a' }) }); await first
  assert.equal(h.busy(), false)
})

for (const component of ['UnifiedNotesInput', 'VoiceNotes']) {
  test(`${component} rejects deleted notes and preserves simultaneous results`, async () => {
    const source = fs.readFileSync(path.join(root, `src/components/${component}.tsx`), 'utf8')
    const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let fn
    function walk(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'transcribeNoteFallback') fn = node.initializer.getText(ast)
      ts.forEachChild(node, walk)
    }
    walk(ast)
    const callbacks = [], ref = { current: [{ id: 'a' }, { id: 'b' }] }
    let notes = 'latest typed notes', changes = 0
    const context = {
      transcription: { transcribe: (id, blob, cb) => callbacks.push(cb) },
      voiceNotesRef: ref, notesRef: { current: notes }, appendTranscriptionToNotes: true,
      onVoiceNotesChange: () => { changes++ }, onNotesChange: text => { notes = text },
    }
    vm.runInNewContext(compile('globalThis.run = ' + fn), context)
    context.run('deleted', audio()); callbacks.pop()('do not append')
    assert.equal(changes, 0); assert.equal(notes, 'latest typed notes')
    context.run('a', audio()); context.run('b', audio())
    callbacks[0]('first'); callbacks[1]('second')
    assert.equal(ref.current[0].transcription, 'first'); assert.equal(ref.current[1].transcription, 'second')
    if (component === 'UnifiedNotesInput') assert.equal(notes, 'latest typed notes\n\nfirst\n\nsecond')
  })
}
