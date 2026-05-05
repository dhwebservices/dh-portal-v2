const SEND_EMAIL_API_PATH = '/api/send-email'

export async function sendEmail(type, data = {}) {
  try {
    const response = await fetch(SEND_EMAIL_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        data,
      }),
    })

    const result = await response.json().catch(() => null)
    if (!response.ok || result?.ok === false || result?.error) {
      throw new Error(result?.error || 'Worker request failed')
    }

    return {
      ok: true,
      status: result?.status || response.status,
      result: result?.result || result || {},
    }
  } catch (error) {
    console.warn('Email send failed:', error)
    return { ok: false, error: error?.message || 'email_send_failed' }
  }
}
