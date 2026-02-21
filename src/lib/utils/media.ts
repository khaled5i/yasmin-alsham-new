/**
 * التحقق مما إذا كان الملف فيديو بناءً على رابط الملف
 * يتحقق من امتداد الملف أو وجود كلمة video في الرابط
 */
export const isVideoFile = (fileUrl: string): boolean => {
  const url = fileUrl.toLowerCase()
  return (
    url.includes('.mp4') ||
    url.includes('.mov') ||
    url.includes('.avi') ||
    url.includes('.webm') ||
    url.includes('video')
  )
}

