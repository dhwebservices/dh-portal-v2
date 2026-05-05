const SEND_EMAIL_API_PATH = '/api/send-email'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function sendEmail(type, data = {}) {
  const retryDelays = [0, 500, 1200]
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await sleep(retryDelays[attempt])
    }
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
        const error = new Error(result?.error || 'Worker request failed')
        const message = String(error.message || '')
        const isRateLimited = /too many requests/i.test(message)
        if (isRateLimited && attempt < retryDelays.length - 1) {
          continue
        }
        throw error
      }

      return {
        ok: true,
        status: result?.status || response.status,
        result: result?.result || result || {},
      }
    } catch (error) {
      const message = String(error?.message || '')
      const isRateLimited = /too many requests/i.test(message)
      if (isRateLimited && attempt < retryDelays.length - 1) {
        continue
      }
      console.warn('Email send failed:', error)
      return { ok: false, error: message || 'email_send_failed' }
    }
  }
  return { ok: false, error: 'email_send_failed' }
}

export async function sendPacedEmailBroadcast(recipients = [], sender) {
  const results = []
  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]
    results.push(await sender(recipient, index))
    if (index < recipients.length - 1) {
      await sleep(250)
    }
  }
  return results
}
