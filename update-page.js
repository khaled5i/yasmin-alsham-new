const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/dashboard/orders/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace measurements button
content = content.replace(
    `                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenMeasurements(order)
                              }}
                              className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100"
                              title={order.measurements && Object.keys(order.measurements).length > 0 ? (t('edit_measurements') || 'تعديل المقاسات') : (t('add_measurements') || 'إضافة مقاسات')}
                            >
                              <Ruler className="w-4 h-4" />
                            </button>`,
    `                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenMeasurements(order)
                              }}
                              className="relative p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-transparent hover:border-purple-100"
                              title={order.measurements && Object.keys(order.measurements).filter(k => k !== 'is_printed').length > 0 ? (t('edit_measurements') || 'تعديل المقاسات') : (t('add_measurements') || 'إضافة مقاسات')}
                            >
                              <Ruler className="w-4 h-4" />
                              {order.measurements && Object.keys(order.measurements).filter(k => k !== 'is_printed').length > 0 && (
                                <CheckCircle className="w-3 h-3 text-green-500 absolute -top-1 -right-1 bg-white rounded-full" />
                              )}
                            </button>`
);

content = content.replace(
    `                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePrintOrder(order)
                              }}
                              className="p-2 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors border border-transparent hover:border-pink-100"
                              title={t('print_order') || 'طباعة'}
                            >
                              <Printer className="w-4 h-4" />
                            </button>`,
    `                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePrintOrder(order)
                              }}
                              className="relative p-2 text-gray-500 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors border border-transparent hover:border-pink-100"
                              title={t('print_order') || 'طباعة'}
                            >
                              <Printer className="w-4 h-4" />
                              {order.measurements?.is_printed && (
                                <CheckCircle className="w-3 h-3 text-green-500 absolute -top-1 -right-1 bg-white rounded-full" />
                              )}
                            </button>`
);

content = content.replace(
    `        {/* مودال الطباعة */}
        {
          printOrder && (
            <PrintOrderModal
              isOpen={showPrintModal}
              onClose={() => {
                setShowPrintModal(false)
                setPrintOrder(null)
              }}
              order={printOrder}
            />
          )
        }`,
    `        {/* مودال الطباعة */}
        {
          printOrder && (
            <PrintOrderModal
              isOpen={showPrintModal}
              onClose={() => {
                setShowPrintModal(false)
                setPrintOrder(null)
              }}
              order={printOrder}
              onPrint={async () => {
                try {
                  const currentMeasurements = printOrder.measurements || {}
                  if (!currentMeasurements.is_printed) {
                    const updatedMeasurements = {
                      ...currentMeasurements,
                      is_printed: true
                    }
                    await updateOrder(printOrder.id, { measurements: updatedMeasurements })
                  }
                } catch (error) {
                  console.error('Error marking order as printed:', error)
                }
              }}
            />
          )
        }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update complete.');
