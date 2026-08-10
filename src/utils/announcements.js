/**
 * The "what's new" popup, driven by the release notes already authored in
 * Settings → Experience.
 *
 * That editor has existed for a while and writes portal_settings.whats_new_payload
 * — version, title, intro and a list of cards — and it emails staff when a
 * release is published. Nothing ever displayed it in the portal, so the popup
 * was the missing half rather than a new feature. This reads that same payload
 * instead of introducing a second one to keep in step.
 *
 * Each person sees a given version once. Dismissal is recorded against their
 * email in portal_settings rather than localStorage, so it follows them between
 * their laptop, the desktop app and their phone.
 */

import { supabase } from './supabase'

export const PAYLOAD_KEY = 'whats_new_payload'

export function seenKeyFor(email) {
  return `whats_new_seen:${String(email || '').toLowerCase().trim()}`
}

/**
 * Turn the authored payload into slides for the modal.
 * The title/intro becomes an opening slide when there is an intro to show;
 * otherwise the first card leads, so a one-card release is one slide, not two.
 */
export function toSlides(payload) {
  const cards = Array.isArray(payload?.cards) ? payload.cards : []
  const usable = cards.filter((card) => card?.title || card?.body)

  const slides = usable.map((card, index) => ({
    id: `card-${index}`,
    tag: card.tag || '',
    heading: card.title || '',
    body: card.body || '',
    image: card.image || '',
    ctaLabel: card.ctaLabel || '',
    ctaHref: card.ctaHref || '',
  }))

  const intro = String(payload?.intro || '').trim()
  if (intro) {
    slides.unshift({
      id: 'intro',
      tag: '',
      heading: payload?.title || 'What’s new',
      body: intro,
      image: payload?.image || '',
      ctaLabel: '',
      ctaHref: '',
    })
  }

  return slides
}

export async function loadWhatsNew() {
  const { data } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', PAYLOAD_KEY)
    .maybeSingle()

  const payload = data?.value?.value ?? data?.value ?? null
  if (!payload || typeof payload !== 'object') return null

  return {
    active: payload.active === true,
    version: String(payload.version || '').trim(),
    title: payload.title || 'What’s new',
    intro: payload.intro || '',
    slides: toSlides(payload),
  }
}

export async function loadSeenVersion(email) {
  if (!email) return null
  const { data } = await supabase
    .from('portal_settings')
    .select('value')
    .eq('key', seenKeyFor(email))
    .maybeSingle()
  const value = data?.value?.value ?? data?.value
  return value?.version ? String(value.version) : null
}

export async function markSeen(email, version) {
  if (!email || !version) return
  await supabase
    .from('portal_settings')
    .upsert(
      { key: seenKeyFor(email), value: { value: { version, seen_at: new Date().toISOString() } } },
      { onConflict: 'key' },
    )
}

/**
 * A release needs a version to be shown. Without one there is nothing to record
 * as seen, so the popup would return on every page load - worse than not
 * showing it at all.
 */
export function shouldShow(release, seenVersion) {
  if (!release?.active) return false
  if (!release.version) return false
  if (!release.slides?.length) return false
  return release.version !== seenVersion
}
