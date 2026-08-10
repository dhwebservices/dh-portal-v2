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

/**
 * Where the block manifest is read from.
 *
 * The caller may name an origin, because while the block engine is still on a
 * branch the manifest only exists on a preview build. It is checked against an
 * allowlist rather than trusted: this fetches a document that then becomes the
 * page's content, so an arbitrary origin here would let an authenticated user
 * import content from anywhere.
 */
function resolveSiteOrigin(env, requested) {
  const configured = env.PUBLIC_SITE_ORIGIN || 'https://dhwebsiteservices.co.uk'
  if (!requested) return configured

  let host
  try {
    const url = new URL(requested)
    if (url.protocol !== 'https:') return configured
    host = url.host
  } catch {
    return configured
  }

  const allowed = host === 'dhwebsiteservices.co.uk'
    || host === 'www.dhwebsiteservices.co.uk'
    || host.endsWith('.dh-website-djh.pages.dev')

  return allowed ? `https://${host}` : configured
}

async function getPage(env, payload) {
  const slug = String(payload?.slug || '').trim()
  if (!slug) return json({ error: 'No page requested.' }, 400)

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    { headers: supabaseHeaders(env) },
  )
  const rows = await response.json().catch(() => [])
  const page = Array.isArray(rows) ? rows[0] : null
  if (!page) return json({ error: `No page with slug "${slug}".` }, 404)

  return json({ ok: true, page })
}

/**
 * Seed a page's draft from the document bundled in the site build.
 * Refuses to overwrite an existing draft - importing is for starting a page
 * off, not for quietly discarding someone's unpublished work.
 */
async function importPage(env, user, payload) {
  const slug = String(payload?.slug || '').trim()
  if (!slug) return json({ error: 'No page requested.' }, 400)

  const origin = resolveSiteOrigin(env, payload?.siteOrigin)
  const manifestUrl = `${origin}/block-manifest.json`
  const manifest = await fetch(manifestUrl, { cf: { cacheTtl: 0 } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)

  const document = manifest?.documents?.[slug]
  if (!document) {
    return json({ error: `The site build has no built-in document for "${slug}".` }, 404)
  }

  const existing = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}&select=content&limit=1`,
    { headers: supabaseHeaders(env) },
  ).then((r) => r.json()).catch(() => [])

  const currentBlocks = existing?.[0]?.content?.blocks
  if (Array.isArray(currentBlocks) && currentBlocks.length > 0 && !payload?.overwrite) {
    return json({ error: 'This page already has a draft. Importing would discard it.' }, 409)
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env, { Prefer: 'return=representation' }),
      body: JSON.stringify({
        content: document,
        updated_at: new Date().toISOString(),
        updated_by_email: user.email,
        updated_by_name: user.name,
      }),
    },
  )
  if (!response.ok) return json({ error: 'Could not import the page.' }, 502)

  return json({ ok: true, slug, blocks: document.blocks?.length || 0 })
}

async function saveDraft(env, user, payload) {
  const slug = String(payload?.slug || '').trim()
  const document = payload?.document
  if (!slug) return json({ error: 'No page requested.' }, 400)
  if (!document || !Array.isArray(document.blocks)) {
    return json({ error: 'A block document is required.' }, 400)
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        content: document,
        updated_at: new Date().toISOString(),
        updated_by_email: user.email,
        updated_by_name: user.name,
      }),
    },
  )
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return json({ error: 'Could not save the draft.', detail: detail.slice(0, 300) }, 502)
  }
  return json({ ok: true, savedAt: new Date().toISOString() })
}

/**
 * Copy draft to published, and keep the previous published version so a bad
 * publish is one click back rather than a retype.
 */
async function publishPage(env, user, payload) {
  const slug = String(payload?.slug || '').trim()
  if (!slug) return json({ error: 'No page requested.' }, 400)

  const rows = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}&select=id,content,published_content&limit=1`,
    { headers: supabaseHeaders(env) },
  ).then((r) => r.json()).catch(() => [])

  const page = Array.isArray(rows) ? rows[0] : null
  if (!page) return json({ error: `No page with slug "${slug}".` }, 404)
  if (!Array.isArray(page.content?.blocks) || page.content.blocks.length === 0) {
    return json({ error: 'There is nothing in this draft to publish.' }, 400)
  }

  if (page.published_content) {
    // version_number is NOT NULL with no default, so it has to be worked out
    // here rather than left to the database.
    const previous = await fetch(
      `${env.SUPABASE_URL}/rest/v1/website_versions`
        + `?page_id=eq.${page.id}&select=version_number&order=version_number.desc&limit=1`,
      { headers: supabaseHeaders(env) },
    ).then((r) => r.json()).catch(() => [])

    const nextVersion = (Number(previous?.[0]?.version_number) || 0) + 1

    await fetch(`${env.SUPABASE_URL}/rest/v1/website_versions`, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        page_id: page.id,
        version_number: nextVersion,
        label: `Replaced on publish by ${user.name || user.email}`,
        content: page.published_content,
        created_by_email: user.email,
        created_by_name: user.name,
      }),
    }).catch(() => null) // history is useful, not worth failing a publish over
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        published_content: page.content,
        status: 'published',
        published_at: new Date().toISOString(),
        updated_by_email: user.email,
        updated_by_name: user.name,
      }),
    },
  )
  if (!response.ok) return json({ error: 'Could not publish the page.' }, 502)

  return json({ ok: true, slug, publishedAt: new Date().toISOString() })
}

/**
 * Put the draft back to whatever is currently published.
 *
 * The counterpart to publish. Without it, a draft that goes wrong - a bad
 * import, an edit in the wrong place - can only be undone by retyping, because
 * the editor's undo stack does not survive a reload.
 */
async function revertDraft(env, user, payload) {
  const slug = String(payload?.slug || '').trim()
  if (!slug) return json({ error: 'No page requested.' }, 400)

  const rows = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}&select=published_content&limit=1`,
    { headers: supabaseHeaders(env) },
  ).then((r) => r.json()).catch(() => [])

  const published = Array.isArray(rows) ? rows[0]?.published_content : null
  if (!published?.blocks?.length) {
    return json({ error: 'This page has never been published, so there is nothing to go back to.' }, 400)
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/website_pages?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        content: published,
        updated_at: new Date().toISOString(),
        updated_by_email: user.email,
        updated_by_name: user.name,
      }),
    },
  )
  if (!response.ok) return json({ error: 'Could not restore the draft.' }, 502)
  return json({ ok: true, slug })
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
      case 'get_page':
        return await getPage(env, payload)
      case 'import_page':
        return await importPage(env, user, payload)
      case 'save_draft':
        return await saveDraft(env, user, payload)
      case 'publish_page':
        return await publishPage(env, user, payload)
      case 'revert_draft':
        return await revertDraft(env, user, payload)
      default:
        return json({ error: `Unknown action "${payload?.action}".` }, 400)
    }
  } catch (error) {
    console.warn('website-cms failed:', error)
    return json({ error: error?.message || 'Website CMS request failed.' }, 500)
  }
}
