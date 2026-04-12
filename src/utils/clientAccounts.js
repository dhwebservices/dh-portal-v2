import { supabase } from './supabase'

export function normalizeClientEmail(email = '') {
  return String(email || '').trim().toLowerCase()
}

function todayIsoDate() {
  return new Date().toISOString().split('T')[0]
}

export function toClientAccountPayload(record = {}, overrides = {}) {
  const email = normalizeClientEmail(overrides.email ?? record.email)
  return {
    name: String(overrides.name ?? record.name ?? '').trim() || 'Client account',
    contact: overrides.contact ?? record.contact ?? null,
    email,
    phone: overrides.phone ?? record.phone ?? null,
    plan: overrides.plan ?? record.plan ?? 'Starter',
    value: Number(overrides.value ?? record.value ?? 0) || 0,
    status: overrides.status ?? record.status ?? 'active',
    invoice_paid: Boolean(overrides.invoice_paid ?? record.invoice_paid),
    joined: overrides.joined ?? record.joined ?? (record.created_at ? String(record.created_at).split('T')[0] : todayIsoDate()),
    deployment_status: overrides.deployment_status ?? record.deployment_status ?? 'accepted',
    website_url: overrides.website_url ?? record.website_url ?? null,
    notes: overrides.notes ?? record.notes ?? null,
    created_at: overrides.created_at ?? record.created_at ?? new Date().toISOString(),
  }
}

export async function upsertClientAccount(record = {}, overrides = {}) {
  const payload = toClientAccountPayload(record, overrides)
  if (!payload.email) return { data: null, error: null }

  return supabase
    .from('client_accounts')
    .upsert([payload], { onConflict: 'email' })
    .select()
    .maybeSingle()
}

export async function deleteClientAccountByEmail(email) {
  const normalized = normalizeClientEmail(email)
  if (!normalized) return { error: null }
  return supabase.from('client_accounts').delete().ilike('email', normalized)
}

export async function syncClientLinkedRecords({ oldEmail, newEmail, clientName }) {
  const previous = normalizeClientEmail(oldEmail)
  const next = normalizeClientEmail(newEmail)
  if (!previous) return

  const namePatch = clientName ? { client_name: clientName } : {}
  const tasks = []

  if (next && next !== previous) {
    tasks.push(
      supabase.from('client_invoices').update({ client_email: next, ...namePatch }).ilike('client_email', previous),
      supabase.from('client_documents').update({ client_email: next }).ilike('client_email', previous),
      supabase.from('deployment_updates').update({ client_email: next }).ilike('client_email', previous),
      supabase.from('support_tickets').update({ client_email: next, ...namePatch }).ilike('client_email', previous),
      supabase.from('client_activity').update({ client_email: next }).ilike('client_email', previous),
      supabase.from('client_payments').update({ client_email: next, ...namePatch }).ilike('client_email', previous),
      supabase.from('gocardless_mandates').update({ client_email: next, ...namePatch }).ilike('client_email', previous),
      supabase.from('notifications').update({ user_email: next }).ilike('user_email', previous),
    )
  } else if (Object.keys(namePatch).length) {
    tasks.push(
      supabase.from('client_invoices').update(namePatch).ilike('client_email', previous),
      supabase.from('support_tickets').update(namePatch).ilike('client_email', previous),
      supabase.from('client_payments').update(namePatch).ilike('client_email', previous),
      supabase.from('gocardless_mandates').update(namePatch).ilike('client_email', previous),
    )
  }

  if (!tasks.length) return
  await Promise.all(tasks)

  if (next && next !== previous) {
    const summaryKey = `client_onboarding:${previous}`
    const nextSummaryKey = `client_onboarding:${next}`
    const sectionPrefix = `client_onboarding_section:${previous}:`
    const nextSectionPrefix = `client_onboarding_section:${next}:`

    const [{ data: summaryRow }, { data: sectionRows }] = await Promise.all([
      supabase.from('portal_settings').select('key,value').eq('key', summaryKey).maybeSingle(),
      supabase.from('portal_settings').select('key,value').like('key', `${sectionPrefix}%`),
    ])

    const onboardingUpserts = []

    if (summaryRow?.value) {
      const summaryValue = summaryRow.value?.value ?? summaryRow.value ?? {}
      onboardingUpserts.push({
        key: nextSummaryKey,
        value: {
          ...summaryValue,
          client_email: next,
          updated_at: new Date().toISOString(),
        },
      })
    }

    ;(sectionRows || []).forEach((row) => {
      const sectionKey = String(row.key || '').replace(sectionPrefix, '')
      const rawValue = row.value?.value ?? row.value ?? {}
      onboardingUpserts.push({
        key: `${nextSectionPrefix}${sectionKey}`,
        value: {
          ...rawValue,
          client_email: next,
          updated_at: new Date().toISOString(),
        },
      })
    })

    if (onboardingUpserts.length) {
      await supabase.from('portal_settings').upsert(onboardingUpserts, { onConflict: 'key' })
      await Promise.all([
        supabase.from('portal_settings').delete().eq('key', summaryKey),
        supabase.from('portal_settings').delete().like('key', `${sectionPrefix}%`),
      ])
    }
  }
}

export async function logClientActivity({
  clientEmail,
  eventType,
  title,
  description,
  amount = null,
}) {
  const normalized = normalizeClientEmail(clientEmail)
  if (!normalized || !eventType) return { error: null }

  const payload = {
    client_email: normalized,
    event_type: eventType,
    title: title || null,
    description: description || null,
    amount,
    created_at: new Date().toISOString(),
  }

  return supabase.from('client_activity').insert([payload])
}
