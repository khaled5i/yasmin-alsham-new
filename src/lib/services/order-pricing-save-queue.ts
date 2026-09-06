import { orderService, type UpdateOrderData } from './order-service'

// A slow response must never overwrite a newer price. Keep writes for each order in order,
// coalescing pending keystrokes while an earlier save is in flight.
const queues = new Map<string, { version: number; tail: Promise<void> }>()
export function saveOrderPricing(orderId: string, updates: UpdateOrderData): Promise<void> {
  const queue = queues.get(orderId) || { version: 0, tail: Promise.resolve() }
  const version = ++queue.version
  const task = queue.tail
    .catch(() => {})
    .then(async () => {
      if (version !== queue.version) return
      const result = await orderService.update(orderId, updates)
      if (result.error || !result.data) throw new Error(result.error || 'تعذر حفظ التسعير')
    })
  queue.tail = task
  queues.set(orderId, queue)
  void task
    .finally(() => {
      if (queue.version === version) queues.delete(orderId)
    })
    .catch(() => {})
  return task
}
