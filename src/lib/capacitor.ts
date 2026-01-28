/**
 * أدوات مساعدة للتعامل مع Capacitor
 * تُستخدم للتحقق من بيئة التشغيل والوصول إلى ميزات الجهاز
 */

import { Capacitor } from '@capacitor/core';

/**
 * التحقق مما إذا كان التطبيق يعمل على منصة native
 */
export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * الحصول على اسم المنصة الحالية
 */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

/**
 * التحقق مما إذا كان التطبيق يعمل على iOS
 */
export const isIOS = (): boolean => {
  return getPlatform() === 'ios';
};

/**
 * التحقق مما إذا كان التطبيق يعمل على Android
 */
export const isAndroid = (): boolean => {
  return getPlatform() === 'android';
};

/**
 * التحقق مما إذا كان التطبيق يعمل على الويب
 */
export const isWeb = (): boolean => {
  return getPlatform() === 'web';
};

/**
 * التحقق من توفر plugin معين
 */
export const isPluginAvailable = (pluginName: string): boolean => {
  return Capacitor.isPluginAvailable(pluginName);
};

/**
 * تحويل مسار الملف إلى URL يمكن استخدامه في الويب
 */
export const convertFileSrc = (filePath: string): string => {
  return Capacitor.convertFileSrc(filePath);
};

