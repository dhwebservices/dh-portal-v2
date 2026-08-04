/**
 * Website Hosting Worker
 *
 * Serves published websites from R2 storage
 *
 * Routes:
 * - https://sites.dhwebsiteservices.co.uk/{slug} → Serve page
 * - https://preview.dhwebsiteservices.co.uk/{previewId} → Serve preview
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const hostname = url.hostname
    const pathname = url.pathname

    // Handle preview subdomain
    if (hostname.startsWith('preview.')) {
      return await servePreview(pathname, env)
    }

    // Handle sites subdomain
    if (hostname.startsWith('sites.')) {
      return await servePublishedPage(pathname, env)
    }

    // Handle custom domains (future feature)
    if (hostname !== 'dhwebsiteservices.co.uk' && !hostname.includes('pages.dev')) {
      return await serveCustomDomain(hostname, pathname, env)
    }

    return new Response('Not Found', { status: 404 })
  },
}

/**
 * Serve a published page from R2
 */
async function servePublishedPage(pathname, env) {
  // Extract slug from pathname (e.g., /my-page → my-page)
  const slug = pathname.slice(1) || 'index'

  // Fetch from R2
  const bucket = env.WEBSITE_BUCKET
  const key = `pages/${slug}.html`

  const object = await bucket.get(key)

  if (!object) {
    return new Response('Page not found', {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=3600')
  headers.set('X-Powered-By', 'DH Website Services')

  return new Response(object.body, {
    headers,
    status: 200
  })
}

/**
 * Serve a preview from KV (temporary)
 */
async function servePreview(pathname, env) {
  const previewId = pathname.slice(1) // /abc123 → abc123

  const kv = env.PREVIEW_KV
  const html = await kv.get(`preview:${previewId}`)

  if (!html) {
    return new Response('Preview expired or not found', {
      status: 404,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Preview-Mode': 'true'
    },
    status: 200
  })
}

/**
 * Serve from custom domain (future feature)
 */
async function serveCustomDomain(hostname, pathname, env) {
  // Query database for custom domain mapping
  // domain_mappings table: domain → slug
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/domain_mappings?domain=eq.${hostname}`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    }
  )

  const mappings = await response.json()

  if (!mappings || mappings.length === 0) {
    return new Response('Domain not configured', { status: 404 })
  }

  const { slug } = mappings[0]

  // Serve the page
  const bucket = env.WEBSITE_BUCKET
  const key = `pages/${slug}.html`

  const object = await bucket.get(key)

  if (!object) {
    return new Response('Page not found', { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Cache-Control', 'public, max-age=3600')

  return new Response(object.body, {
    headers,
    status: 200
  })
}
