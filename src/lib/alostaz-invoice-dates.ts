interface AlostazInvoiceDateInput {
  plannedDueDate?: string | null
  manualDeliveryDate?: string | null
}

export interface AlostazInvoiceDates {
  issueDate: string
  dueDate: string
}

export function resolveAlostazInvoiceDates(
  input: AlostazInvoiceDateInput,
  now: Date = new Date(),
): AlostazInvoiceDates {
  const nowIso = now.toISOString()

  if (input.manualDeliveryDate) {
    const actualDeliveryIso = new Date(input.manualDeliveryDate).toISOString()
    return {
      issueDate: actualDeliveryIso,
      dueDate: actualDeliveryIso,
    }
  }

  return {
    issueDate: nowIso,
    dueDate: input.plannedDueDate
      ? new Date(input.plannedDueDate).toISOString()
      : nowIso,
  }
}
