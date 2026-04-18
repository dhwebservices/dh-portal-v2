import { sendEmail } from './email'

function formatPrice(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))
}

function shell({ eyebrow, title, body, details = [] }) {
  const rows = details
    .filter((item) => item.value)
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;color:#7a8090;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">${item.label}</td>
          <td style="padding:10px 0;color:#141822;font-size:15px;font-weight:600;text-align:right;">${item.value}</td>
        </tr>
      `
    )
    .join('')

  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:32px 0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#141822;">
      <div style="max-width:620px;margin:0 auto;padding:0 20px;">
        <div style="background:#ffffff;border:1px solid rgba(18,26,46,0.08);border-radius:28px;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,0.08);">
          <div style="padding:32px 32px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid rgba(18,26,46,0.06);">
            <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:#eef4ff;color:#0f62fe;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${eyebrow}</div>
            <h1 style="margin:18px 0 10px;font-size:34px;line-height:1.05;letter-spacing:-0.04em;">${title}</h1>
            <p style="margin:0;color:#5d6577;font-size:16px;line-height:1.75;">${body}</p>
          </div>
          <div style="padding:28px 32px;">
            <table style="width:100%;border-collapse:collapse;">${rows}</table>
          </div>
        </div>
        <div style="padding:18px 8px 0;color:#7a8090;font-size:12px;line-height:1.7;text-align:center;">
          DH Website Services · Cardiff, United Kingdom<br/>
          clients@dhwebsiteservices.co.uk
        </div>
      </div>
    </body>
  </html>`
}

function orderSummary(order) {
  return [
    { label: 'Order number', value: order.order_number },
    { label: 'Total', value: formatPrice(order.grand_total) },
  ]
}

export async function sendAwaitingDispatchEmail(order) {
  if (!order?.email) return
  return sendEmail('custom_email', {
    to: order.email,
    from_email: 'noreply@dhwebsiteservices.co.uk',
    subject: `Order update: ${order.order_number} is awaiting dispatch`,
    html: shell({
      eyebrow: 'Awaiting dispatch',
      title: `Your order ${order.order_number} is now awaiting dispatch.`,
      body: 'We have confirmed and placed your order. It is now in the dispatch queue and we will update you again once delivery is complete.',
      details: orderSummary(order),
    }),
    text: `Your order ${order.order_number} is now awaiting dispatch.`,
  })
}

export async function sendDeliveredEmail(order) {
  if (!order?.email) return
  return sendEmail('custom_email', {
    to: order.email,
    from_email: 'noreply@dhwebsiteservices.co.uk',
    subject: `Order delivered: ${order.order_number}`,
    html: shell({
      eyebrow: 'Delivered',
      title: `Your order ${order.order_number} has been marked as delivered.`,
      body: 'Your order has now been completed. If you need any follow-up support or have an issue with the delivery, reply to this email and the team will help.',
      details: orderSummary(order),
    }),
    text: `Your order ${order.order_number} has been marked as delivered.`,
  })
}
