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

export async function sendPaymentEmail(customerEmail, customerName, paymentLink, amount, description) {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1612; color: #fff; padding: 32px; border-radius: 12px; margin-bottom: 24px;">
        <h1 style="font-size: 24px; margin: 0 0 8px 0;">DH Website Services</h1>
        <p style="margin: 0; opacity: 0.6;">Website Design & Development</p>
      </div>

      <div style="padding: 24px; background: #fff; border: 1px solid #e2ddd5; border-radius: 10px;">
        <h2 style="font-size: 18px; margin: 0 0 16px 0;">Hi ${customerName},</h2>

        <p style="font-size: 14px; line-height: 1.6; color: #6b6158;">
          Thank you for choosing DH Website Services! Your proposal is ready and we're excited to get started on your project.
        </p>

        <div style="background: #fffdf5; border: 2px solid #b8960c; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="font-size: 13px; color: #a8a096; margin-bottom: 4px;">PAYMENT AMOUNT</div>
          <div style="font-size: 28px; font-weight: 700; color: #b8960c; margin-bottom: 8px;">£${Number(amount).toLocaleString()}</div>
          <div style="font-size: 14px; color: #6b6158;">${description}</div>
        </div>

        <a href="${paymentLink}" style="display: inline-block; background: #1a1612; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
          💳 Pay Securely with Stripe
        </a>

        <p style="font-size: 13px; color: #a8a096; margin-top: 24px;">
          This is a secure payment link powered by Stripe. Your payment information is never stored by DH Website Services.
        </p>
      </div>

      <div style="text-align: center; padding: 24px; font-size: 12px; color: #a8a096;">
        <strong>DH Website Services</strong><br/>
        david@dhwebsiteservices.co.uk · dhwebsiteservices.co.uk
      </div>
    </div>
  `

  return sendEmail('custom', {
    to: [customerEmail],
    subject: `Payment Request - ${description}`,
    html,
    log_email: true,
  })
}
