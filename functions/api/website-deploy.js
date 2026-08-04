/**
 * Website Deployment API
 *
 * Handles publishing website pages to Cloudflare R2 + Workers
 *
 * POST /api/website-deploy
 * Body: { type: 'deploy_page', pageId, html, css, seo }
 *
 * Returns: { url, deploymentId }
 */

export async function onRequest(context) {
  const { request, env } = context

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { type, pageId, slug, html, css, seo, assets } = await request.json()

    if (type === 'deploy_page') {
      return await deployPage({ pageId, slug, html, css, seo, assets }, env, corsHeaders)
    }

    if (type === 'unpublish_page') {
      return await unpublishPage({ pageId, slug }, env, corsHeaders)
    }

    if (type === 'preview_page') {
      return await previewPage({ html, css, seo }, env, corsHeaders)
    }

    return new Response(
      JSON.stringify({ error: 'Invalid type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Deployment error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Deployment failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Deploy a page to R2 storage
 */
async function deployPage({ pageId, slug, html, css, seo, assets }, env, corsHeaders) {
  // Generate complete HTML document
  const fullHtml = generateFullHtml(html, css, seo, slug)

  // Store in R2 bucket (or use KV for smaller pages)
  const bucket = env.WEBSITE_BUCKET // R2 bucket binding
  const key = `pages/${slug}.html`

  // Upload to R2
  await bucket.put(key, fullHtml, {
    httpMetadata: {
      contentType: 'text/html; charset=utf-8',
      cacheControl: 'public, max-age=3600'
    },
    customMetadata: {
      pageId,
      deployedAt: new Date().toISOString()
    }
  })

  // Generate public URL
  const publicUrl = `https://sites.${env.DOMAIN}/${slug}`

  // Update database via Supabase
  await updateDeploymentRecord(pageId, publicUrl, env)

  return new Response(
    JSON.stringify({
      success: true,
      url: publicUrl,
      deployedAt: new Date().toISOString(),
      key
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Unpublish a page (delete from R2)
 */
async function unpublishPage({ slug }, env, corsHeaders) {
  const bucket = env.WEBSITE_BUCKET
  const key = `pages/${slug}.html`

  await bucket.delete(key)

  return new Response(
    JSON.stringify({ success: true, message: 'Page unpublished' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Generate preview HTML (temporary, not saved)
 */
async function previewPage({ html, css, seo }, env, corsHeaders) {
  const fullHtml = generateFullHtml(html, css, seo, 'preview')

  // Store in KV with short TTL (5 minutes)
  const kv = env.PREVIEW_KV
  const previewId = crypto.randomUUID()

  await kv.put(`preview:${previewId}`, fullHtml, { expirationTtl: 300 })

  const previewUrl = `https://preview.${env.DOMAIN}/${previewId}`

  return new Response(
    JSON.stringify({ success: true, url: previewUrl, previewId }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Generate complete HTML document with SEO meta tags
 */
function generateFullHtml(bodyHtml, css, seo = {}, slug) {
  const title = seo.og_title || seo.meta_description || 'Page'
  const description = seo.meta_description || ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  ${seo.meta_keywords?.length ? `<meta name="keywords" content="${seo.meta_keywords.join(', ')}">` : ''}
  ${seo.robots ? `<meta name="robots" content="${seo.robots}">` : ''}
  ${seo.canonical_url ? `<link rel="canonical" href="${seo.canonical_url}">` : ''}

  <!-- Open Graph -->
  ${seo.og_title ? `<meta property="og:title" content="${escapeHtml(seo.og_title)}">` : ''}
  ${seo.og_description ? `<meta property="og:description" content="${escapeHtml(seo.og_description)}">` : ''}
  ${seo.og_image ? `<meta property="og:image" content="${seo.og_image}">` : ''}
  ${seo.og_type ? `<meta property="og:type" content="${seo.og_type}">` : ''}
  <meta property="og:url" content="https://sites.dhwebsiteservices.co.uk/${slug}">

  <!-- Twitter Card -->
  ${seo.twitter_card ? `<meta name="twitter:card" content="${seo.twitter_card}">` : ''}
  ${seo.twitter_title ? `<meta name="twitter:title" content="${escapeHtml(seo.twitter_title)}">` : ''}
  ${seo.twitter_description ? `<meta name="twitter:description" content="${escapeHtml(seo.twitter_description)}">` : ''}
  ${seo.twitter_image ? `<meta name="twitter:image" content="${seo.twitter_image}">` : ''}

  <!-- Structured Data -->
  ${seo.structured_data ? `<script type="application/ld+json">${JSON.stringify(seo.structured_data)}</script>` : ''}

  <!-- Styles -->
  <style>
    /* Reset */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
    img { max-width: 100%; height: auto; }

    /* Custom Styles */
    ${css || ''}
  </style>
</head>
<body>
  ${bodyHtml}

  <!-- DH Website Services Badge -->
  <div style="position: fixed; bottom: 8px; right: 8px; font-size: 10px; color: #999; opacity: 0.5;">
    Built with DH Website Services
  </div>
</body>
</html>`
}

/**
 * Escape HTML to prevent XSS in meta tags
 */
function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Update deployment record in Supabase
 */
async function updateDeploymentRecord(pageId, publicUrl, env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

  const response = await fetch(`${SUPABASE_URL}/rest/v1/website_pages?id=eq.${pageId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      status: 'published',
      published_at: new Date().toISOString(),
      // We'll add deployed_url field to database schema
      settings: {
        deployed_url: publicUrl,
        last_deployed_at: new Date().toISOString()
      }
    })
  })

  if (!response.ok) {
    throw new Error('Failed to update deployment record')
  }
}
