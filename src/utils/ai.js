// Routes Claude API calls through our Cloudflare worker to avoid browser CORS restrictions
const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

export async function aiSearch(prompt) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'ai_search', data: { prompt } }),
  })
  if (!res.ok) throw new Error(`Worker error: ${res.status}`)
  const result = await res.json()
  if (result.error) throw new Error(result.error)
  return result.text || ''
}

export function parseJSON(text) {
  try {
    // Strip markdown code blocks
    let clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    // Find first [ or {
    const start = clean.search(/[\[{]/)
    if (start > 0) clean = clean.slice(start)
    // Find matching end
    const end = clean.search(/[\]}][^[\]{}]*$/)
    if (end >= 0) clean = clean.slice(0, end + 1)
    return JSON.parse(clean)
  } catch { return null }
}
