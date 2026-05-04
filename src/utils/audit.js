function normalizeAuditValue(value, maxLength = 240) {
  const text = String(value ?? '').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export async function logAction(userEmail, userName, action, target, targetId, details = {}) {
  try {
    await fetch('/api/audit-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      user_email: userEmail,
      user_name: userName,
      action,
      target,
      target_id: targetId ? String(targetId) : null,
      details,
      created_at: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.warn('Audit log failed:', e)
  }
}

export async function logSecurityEvent({
  userEmail = '',
  userName = '',
  action = '',
  target = 'security',
  targetId = null,
  outcome = 'success',
  scope = 'general',
  riskLevel = 'medium',
  details = {},
} = {}) {
  return logAction(
    normalizeAuditValue(userEmail),
    normalizeAuditValue(userName),
    normalizeAuditValue(action, 120),
    normalizeAuditValue(target, 120),
    targetId ? normalizeAuditValue(targetId, 120) : null,
    {
      scope: normalizeAuditValue(scope, 80),
      outcome: normalizeAuditValue(outcome, 40),
      risk_level: normalizeAuditValue(riskLevel, 40),
      ...(details && typeof details === 'object' ? details : {}),
    }
  )
}
