/**
 * Server-side writes for public website content.
 *
 * website_content (banner, maintenance mode, mailing-list popup, contact
 * details) used to be written straight from the browser with the anon key.
 * That key ships inside the public site's JavaScript bundle, and the table's
 * policy was allow_all to every role, so anyone who viewed source could rewrite
 * the homepage banner or switch on maintenance mode. Writes now come through
 * here on the service-role key, behind a verified Entra token.
 *
 * Reads stay on the anon key: the public site needs them, and they are public
 * content anyway.
 *
 *   POST { action: 'save_content', section, content }
 *   POST { action: 'list_pages' }
 *
 * Page create/update/publish land here in Phase 2 alongside the editor.
 */

import { requirePortalUser } from './_portalAuth.js'

const PERMISSION = 'website_editor'

// Only these may be written. Stops an authenticated but curious caller from
// inventing sections the site will never read.
const WRITABLE_SECTIONS = new Set([
  'hero',
  'banner',
  'maintenance',
  'mailing_list',
  'contact',
  'services',
  'pricing',
  'faq',
  'portfolio',
  'about',
  'partners',
  'calculator',
  'careers',
])

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function supabaseHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function saveContent(env, user, payload) {
  const section = String(payload?.section || '').trim()
  if (!WRITABLE_SECTIONS.has(section)) {
    return json({ error: `"${section}" is not an editable section.` }, 400)
  }
  if (payload?.content === undefined || payload?.content === null) {
    return json({ error: 'No content supplied.' }, 400)
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_content?on_conflict=section`,
    {
      method: 'POST',
      headers: supabaseHeaders(env, {
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify({
        section,
        content: payload.content,
        updated_at: new Date().toISOString(),
        updated_by: user.name || user.email,
      }),
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return json({ error: `Could not save "${section}".`, detail: detail.slice(0, 300) }, 502)
  }

  return json({ ok: true, section, updated_by: user.name || user.email })
}

async function listPages(env) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages`
      + '?select=id,slug,title,status,active,show_in_nav,nav_label,sort_order,updated_at,published_at'
      + '&order=sort_order.asc.nullslast,created_at.asc',
    { headers: supabaseHeaders(env) },
  )
  const rows = await response.json().catch(() => [])
  if (!response.ok) return json({ error: 'Could not load pages.' }, 502)
  return json({ ok: true, pages: Array.isArray(rows) ? rows : [] })
}

export async function onRequestPost(context) {
  const { request, env } = context

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Website CMS is not configured.' }, 503)
  }

  let user
  try {
    user = await requirePortalUser(request, env, PERMISSION)
  } catch (error) {
    return json({ error: error.message }, error.status || 401)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  try {
    switch (payload?.action) {
      case 'save_content':
        return await saveContent(env, user, payload)
      case 'list_pages':
        return await listPages(env)
      default:
        return json({ error: `Unknown action "${payload?.action}".` }, 400)
    }
  } catch (error) {
    console.warn('website-cms failed:', error)
    return json({ error: error?.message || 'Website CMS request failed.' }, 500)
  }
}
