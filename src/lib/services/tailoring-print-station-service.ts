import { supabase } from '@/lib/supabase'
import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import { enqueueTailoringPrintJob } from './print-job-service'

export type TailoringQueueStatus =
  | 'pending'
  | 'printing'
  | 'done'
  | 'error'
  | 'unknown'

export interface TailoringPrintStationDevice {
  id: string
  name: string
  priority: number
  enabled: boolean
  created_at: string
  updated_at: string
  first_seen_at: string | null
  last_seen_at: string | null
  app_version: string | null
  printer_ip: string | null
  printer_reachable: boolean
  last_error: string | null
}

export interface TailoringPrintStationLease {
  station_id: string
  generation: number
  lease_expires_at: string
  acquired_at: string
  renewed_at: string
}

export interface TailoringPrintStationList {
  stations: TailoringPrintStationDevice[]
  lease: TailoringPrintStationLease | null
}

export interface TailoringQueueCounts {
  pending: number
  printing: number
  error: number
  unknown: number
}

export interface TailoringPrintStationOverview extends TailoringPrintStationList {
  queue: TailoringQueueCounts
  attentionJobs: TailoringAttentionJob[]
}

export interface TailoringAttentionJob {
  id: string
  jobType: string
  status: 'unknown' | 'error'
  orderNumber: string
  invoiceCode: string | null
  errorMessage: string | null
  createdAt: string
}

export interface TailoringStationPairingResult {
  station: Pick<TailoringPrintStationDevice, 'id' | 'name' | 'priority' | 'enabled'>
  pairingCode: string
}

const ACTIVE_QUEUE_STATUSES: TailoringQueueStatus[] = [
  'pending',
  'printing',
  'error',
  'unknown',
]

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function unwrapRpcJson(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data
  return asRecord(value)
}

const RPC_REJECTION_MESSAGES: Record<string, string> = {
  job_is_not_retryable: 'لم تعد مهمة الطباعة قابلة لإعادة المحاولة.',
  job_cannot_be_cancelled_in_current_state: 'لم تعد مهمة الطباعة قابلة للإلغاء في حالتها الحالية.',
}

function assertRpcAccepted(data: unknown, fallbackMessage: string): Record<string, unknown> {
  const result = unwrapRpcJson(data)
  if (result.ok === false || result.accepted === false) {
    const reason = typeof result.reason === 'string' ? result.reason : ''
    throw new Error(RPC_REJECTION_MESSAGES[reason] ?? fallbackMessage)
  }
  return result
}

function normalizeDevice(value: unknown): TailoringPrintStationDevice | null {
  const row = asRecord(value)
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null

  return {
    id: row.id,
    name: row.name,
    priority: Number(row.priority) || 0,
    enabled: row.enabled !== false,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
    first_seen_at: typeof row.first_seen_at === 'string' ? row.first_seen_at : null,
    last_seen_at: typeof row.last_seen_at === 'string' ? row.last_seen_at : null,
    app_version: typeof row.app_version === 'string' ? row.app_version : null,
    printer_ip: typeof row.printer_ip === 'string' ? row.printer_ip : null,
    printer_reachable: row.printer_reachable === true,
    last_error: typeof row.last_error === 'string' ? row.last_error : null,
  }
}

function normalizeLease(value: unknown): TailoringPrintStationLease | null {
  const row = asRecord(value)
  if (
    typeof row.station_id !== 'string' ||
    typeof row.lease_expires_at !== 'string'
  ) {
    return null
  }

  return {
    station_id: row.station_id,
    generation: Number(row.generation) || 0,
    lease_expires_at: row.lease_expires_at,
    acquired_at: typeof row.acquired_at === 'string' ? row.acquired_at : '',
    renewed_at: typeof row.renewed_at === 'string' ? row.renewed_at : '',
  }
}

function normalizePairingResult(data: unknown): TailoringStationPairingResult {
  const result = unwrapRpcJson(data)
  const station = normalizeDevice(result.station)
  const pairingCode = result.pairing_code

  if (!station || typeof pairingCode !== 'string' || pairingCode.length === 0) {
    throw new Error('لم تُرجع قاعدة البيانات رمز إقران صالحًا.')
  }

  return {
    station: {
      id: station.id,
      name: station.name,
      priority: station.priority,
      enabled: station.enabled,
    },
    pairingCode,
  }
}

export async function listTailoringPrintStations(): Promise<TailoringPrintStationList> {
  const { data, error } = await supabase.rpc('list_tailoring_print_stations')
  if (error) throw error

  const result = unwrapRpcJson(data)
  const stations = Array.isArray(result.stations)
    ? result.stations
        .map(normalizeDevice)
        .filter((station): station is TailoringPrintStationDevice => station !== null)
        .sort((a, b) => a.priority - b.priority)
    : []

  return {
    stations,
    lease: normalizeLease(result.lease),
  }
}

export async function getTailoringQueueCounts(): Promise<TailoringQueueCounts> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('status')
    .eq('branch', 'tailoring')
    .in('status', ACTIVE_QUEUE_STATUSES)

  if (error) throw error

  const counts: TailoringQueueCounts = {
    pending: 0,
    printing: 0,
    error: 0,
    unknown: 0,
  }

  for (const row of data ?? []) {
    const status = row.status as keyof TailoringQueueCounts
    if (status in counts) counts[status] += 1
  }

  return counts
}

export async function listTailoringAttentionJobs(limit = 12): Promise<TailoringAttentionJob[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('id, job_type, payload, status, error_message, created_at')
    .eq('branch', 'tailoring')
    .in('status', ['unknown', 'error'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).flatMap((row) => {
    if (row.status !== 'unknown' && row.status !== 'error') return []
    const payload = asRecord(row.payload)
    const orderNumber =
      typeof payload.order_number === 'string'
        ? payload.order_number
        : typeof payload.withdrawalId === 'string'
          ? `درج النقد · ${payload.withdrawalId.slice(0, 8)}`
          : 'مهمة تفصيل'

    return [{
      id: String(row.id),
      jobType: String(row.job_type || ''),
      status: row.status,
      orderNumber,
      invoiceCode: typeof payload.invoice_code === 'string' ? payload.invoice_code : null,
      errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
      createdAt: String(row.created_at || ''),
    }]
  })
}

export async function getTailoringPrintStationOverview(): Promise<TailoringPrintStationOverview> {
  const [stationList, queue, attentionJobs] = await Promise.all([
    listTailoringPrintStations(),
    getTailoringQueueCounts(),
    listTailoringAttentionJobs(),
  ])

  return { ...stationList, queue, attentionJobs }
}

export async function createTailoringPrintStation(
  name: string,
  priority: number
): Promise<TailoringStationPairingResult> {
  const { data, error } = await supabase.rpc('create_tailoring_print_station', {
    p_name: name.trim(),
    p_priority: priority,
  })

  if (error) throw error
  return normalizePairingResult(data)
}

export async function rotateTailoringPrintStationSecret(
  stationId: string
): Promise<TailoringStationPairingResult> {
  const { data, error } = await supabase.rpc('rotate_tailoring_print_station_secret', {
    p_station_id: stationId,
  })

  if (error) throw error
  return normalizePairingResult(data)
}

export async function setTailoringPrintStationEnabled(
  stationId: string,
  enabled: boolean
): Promise<void> {
  const { data, error } = await supabase.rpc('set_tailoring_print_station_enabled', {
    p_station_id: stationId,
    p_enabled: enabled,
  })

  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات تغيير حالة المحطة.')
}

export async function releaseTailoringPrintStationLease(stationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('release_tailoring_print_station_lease', {
    p_station_id: stationId,
  })

  if (error) throw error
  const result = assertRpcAccepted(data, 'تعذّر تحرير قيادة محطة الطباعة.')
  if (result.released !== true) {
    throw new Error('لم تعد هذه المحطة هي المحطة النشطة.')
  }
}

export async function retryTailoringPrintJob(jobId: string): Promise<void> {
  const { data, error } = await supabase.rpc('retry_tailoring_print_job', {
    p_job_id: jobId,
  })
  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات إعادة مهمة الطباعة.')
}

export async function cancelTailoringPrintJob(jobId: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_tailoring_print_job', {
    p_job_id: jobId,
  })
  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات إلغاء مهمة الطباعة.')
}

export async function queueTailoringStationTest(): Promise<void> {
  const now = new Date()
  const testId = globalThis.crypto.randomUUID()
  const payload: TailoringReceiptPayload = {
    order_id: testId,
    order_number: 'TEST',
    invoice_code: 'PRINT-STATION-TEST',
    invoice_code_source: 'local',
    receipt_type: 'preliminary',
    customer_name: 'اختبار محطة الطباعة',
    item_description: 'اختبار اتصال طابعة التفصيل',
    total: 0,
    paid_amount: 0,
    cash_amount: 0,
    network_amount: 0,
    delivered_at: now.toISOString(),
  }

  await enqueueTailoringPrintJob(payload, {
    jobType: 'tailoring_order_receipt',
    incomeId: testId,
    openCashDrawer: false,
    forceNewJob: true,
  })
}
