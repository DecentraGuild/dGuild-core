function shouldRegisterServiceWorker(): boolean {
  if (import.meta.env.PROD) return true
  if (!import.meta.dev || typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1'
}

export default defineNuxtPlugin(() => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!shouldRegisterServiceWorker()) return
  void navigator.serviceWorker.register('/sw.js').catch(() => {})
})
