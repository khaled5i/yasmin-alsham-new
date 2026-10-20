'use client'

import FabricTailoringCta from './FabricTailoringCta'

/**
 * مدخل خاص بصفحات المجموعات (مكوّنات خادم). FabricTailoringCta مستورد أيضاً داخل
 * صفحة القماش (شجرة عميل)، وTurbopack يفشل حين يستورد مكوّن خادم وحدة عميل كهذه
 * مباشرة («Could not find the module … in the React Client Manifest»).
 */
export default function CollectionTailoringCta() {
  return <FabricTailoringCta />
}
