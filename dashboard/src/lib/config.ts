const getN8nUrl = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('n8n_url')
    if (stored) return stored
  }
  return process.env.NEXT_PUBLIC_N8N_URL || 'http://localhost:5678'
}

export const config = {
  get n8nUrl() {
    return getN8nUrl()
  },
  defaultLimit: 20,
}
