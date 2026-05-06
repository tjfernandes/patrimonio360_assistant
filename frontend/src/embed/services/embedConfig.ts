export function getChatBackendBaseUrl() {
  const configured = import.meta.env.VITE_CHAT_BACKEND_BASE_URL?.trim()
  if (configured) {
    return configured
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:8000`
    }
  }

  return undefined
}
