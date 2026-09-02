/**
 * إدارة محطات طباعة الورشة (branch = 'alterations').
 * نظير tailoring-print-station-service لكن على طابور وحجز قيادة مستقلين تمامًا.
 */

import { supabase } from '@/lib/supabase'
import {
  ALTERATION_TEST_SLIP_JOB_TYPE,
  getAlterationTitleAr,
  getAlterationTitleHi,
  type AlterationSlipPayload,
} from '@/lib/print-alteration-slip'
import { enqueueAlterationSlipPrint } from './alteration-print-job-service'

export type AlterationQueueStatus =
  | 'pending'
  | 'printing'
  | 'done'
  | 'error'
  | 'unknown'

export interface AlterationPrintStationDevice {
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

export interface AlterationPrintStationLease {
  station_id: string
  generation: number
  lease_expires_at: string
  acquired_at: string
  renewed_at: string
}

export interface AlterationPrintStationList {
  stations: AlterationPrintStationDevice[]
  lease: AlterationPrintStationLease | null
}

export interface AlterationQueueCounts {
  pending: number
  printing: number
  error: number
  unknown: number
}

export interface AlterationAttentionJob {
  id: string
  jobType: string
  status: 'unknown' | 'error'
  alterationNumber: string
  title: string | null
  errorMessage: string | null
  createdAt: string
}

export interface AlterationPrintStationOverview extends AlterationPrintStationList {
  queue: AlterationQueueCounts
  attentionJobs: AlterationAttentionJob[]
}

export interface AlterationStationPairingResult {
  station: Pick<AlterationPrintStationDevice, 'id' | 'name' | 'priority' | 'enabled'>
  pairingCode: string
}

const ALTERATIONS_BRANCH = 'alterations'

const ACTIVE_QUEUE_STATUSES: AlterationQueueStatus[] = [
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

function normalizeDevice(value: unknown): AlterationPrintStationDevice | null {
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

function normalizeLease(value: unknown): AlterationPrintStationLease | null {
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

function normalizePairingResult(data: unknown): AlterationStationPairingResult {
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

export async function listAlterationPrintStations(): Promise<AlterationPrintStationList> {
  const { data, error } = await supabase.rpc('list_alterations_print_stations')
  if (error) throw error

  const result = unwrapRpcJson(data)
  const stations = Array.isArray(result.stations)
    ? result.stations
        .map(normalizeDevice)
        .filter((station): station is AlterationPrintStationDevice => station !== null)
        .sort((a, b) => a.priority - b.priority)
    : []

  return {
    stations,
    lease: normalizeLease(result.lease),
  }
}

export async function getAlterationQueueCounts(): Promise<AlterationQueueCounts> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('status')
    .eq('branch', ALTERATIONS_BRANCH)
    .in('status', ACTIVE_QUEUE_STATUSES)

  if (error) throw error

  const counts: AlterationQueueCounts = {
    pending: 0,
    printing: 0,
    error: 0,
    unknown: 0,
  }

  for (const row of data ?? []) {
    const status = row.status as keyof AlterationQueueCounts
    if (status in counts) counts[status] += 1
  }

  return counts
}

export async function listAlterationAttentionJobs(limit = 12): Promise<AlterationAttentionJob[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('id, job_type, payload, status, error_message, created_at')
    .eq('branch', ALTERATIONS_BRANCH)
    .in('status', ['unknown', 'error'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).flatMap((row) => {
    if (row.status !== 'unknown' && row.status !== 'error') return []
    const payload = asRecord(row.payload)

    return [{
      id: String(row.id),
      jobType: String(row.job_type || ''),
      status: row.status,
      alterationNumber:
        typeof payload.alteration_number === 'string' && payload.alteration_number
          ? payload.alteration_number
          : 'ورقة تعديل',
      title: typeof payload.title_ar === 'string' ? payload.title_ar : null,
      errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
      createdAt: String(row.created_at || ''),
    }]
  })
}

export async function getAlterationPrintStationOverview(): Promise<AlterationPrintStationOverview> {
  const [stationList, queue, attentionJobs] = await Promise.all([
    listAlterationPrintStations(),
    getAlterationQueueCounts(),
    listAlterationAttentionJobs(),
  ])

  return { ...stationList, queue, attentionJobs }
}

export async function createAlterationPrintStation(
  name: string,
  priority: number
): Promise<AlterationStationPairingResult> {
  const { data, error } = await supabase.rpc('create_alterations_print_station', {
    p_name: name.trim(),
    p_priority: priority,
  })

  if (error) throw error
  return normalizePairingResult(data)
}

export async function rotateAlterationPrintStationSecret(
  stationId: string
): Promise<AlterationStationPairingResult> {
  const { data, error } = await supabase.rpc('rotate_alterations_print_station_secret', {
    p_station_id: stationId,
  })

  if (error) throw error
  return normalizePairingResult(data)
}

export async function setAlterationPrintStationEnabled(
  stationId: string,
  enabled: boolean
): Promise<void> {
  const { data, error } = await supabase.rpc('set_alterations_print_station_enabled', {
    p_station_id: stationId,
    p_enabled: enabled,
  })

  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات تغيير حالة المحطة.')
}

export async function releaseAlterationPrintStationLease(stationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('release_alterations_print_station_lease', {
    p_station_id: stationId,
  })

  if (error) throw error
  const result = assertRpcAccepted(data, 'تعذّر تحرير قيادة محطة الطباعة.')
  if (result.released !== true) {
    throw new Error('لم تعد هذه المحطة هي المحطة النشطة.')
  }
}

export async function retryAlterationPrintJob(jobId: string): Promise<void> {
  const { data, error } = await supabase.rpc('retry_alterations_print_job', {
    p_job_id: jobId,
  })
  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات إعادة مهمة الطباعة.')
}

export async function cancelAlterationPrintJob(jobId: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_alterations_print_job', {
    p_job_id: jobId,
  })
  if (error) throw error
  assertRpcAccepted(data, 'لم تقبل قاعدة البيانات إلغاء مهمة الطباعة.')
}

/** ورقة اختبار تُظهر الورقتين العربية والهندية معًا كما تخرجان في الإنتاج. */
export async function queueAlterationStationTest(): Promise<void> {
  const testId = globalThis.crypto.randomUUID()
  const payload: AlterationSlipPayload = {
    alteration_id: testId,
    alteration_number: 'TEST',
    alteration_type: 'after_delivery',
    title_ar: getAlterationTitleAr('after_delivery'),
    title_hi: getAlterationTitleHi('after_delivery'),
    client_name: 'اختبار محطة الورشة',
    due_date: '',
    content_ar: 'ورقة اختبار للتأكد من اتصال طابعة الورشة ووضوح الطباعة.',
    content_hi: 'वर्कशॉप प्रिंटर का कनेक्शन जाँचने के लिए परीक्षण पर्ची।',
    created_at: new Date().toISOString(),
  }

  await enqueueAlterationSlipPrint(payload, {
    jobType: ALTERATION_TEST_SLIP_JOB_TYPE,
    forceNewJob: true,
  })
}
