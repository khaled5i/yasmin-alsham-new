import { NextRequest, NextResponse } from 'next/server'
import { deleteWorkerPayrollOperation } from '@/lib/services/worker-payroll-service'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: operationId } = await params

    if (!operationId) {
      return NextResponse.json(
        { error: 'Operation ID is required' },
        { status: 400 }
      )
    }

    await deleteWorkerPayrollOperation(operationId)

    return NextResponse.json(
      { success: true, message: 'Operation deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting payroll operation:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to delete operation'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
