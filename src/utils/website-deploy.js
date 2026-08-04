/**
 * Website Deployment Utilities
 *
 * Frontend API for deploying websites to Cloudflare R2
 */

const DEPLOY_API = '/api/website-deploy'

/**
 * Call deployment API
 */
async function callDeployApi(type, data) {
  const response = await fetch(DEPLOY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...data }),
  })

  const json = await response.json()

  if (!response.ok || json.error) {
    throw new Error(json.error || 'Deployment failed')
  }

  return json
}

/**
 * Deploy a page to live hosting
 *
 * @param {string} pageId - Page UUID
 * @param {string} slug - URL slug
 * @param {string} html - Body HTML from GrapesJS
 * @param {string} css - CSS from GrapesJS
 * @param {object} seo - SEO metadata
 * @param {array} assets - Asset URLs
 * @returns {Promise<{url, deployedAt, key}>}
 */
export async function deployPage(pageId, slug, html, css, seo, assets = []) {
  return callDeployApi('deploy_page', {
    pageId,
    slug,
    html,
    css,
    seo,
    assets,
  })
}

/**
 * Unpublish a page (remove from live hosting)
 *
 * @param {string} pageId - Page UUID
 * @param {string} slug - URL slug
 * @returns {Promise<{success, message}>}
 */
export async function unpublishPage(pageId, slug) {
  return callDeployApi('unpublish_page', {
    pageId,
    slug,
  })
}

/**
 * Generate a temporary preview URL
 *
 * @param {string} html - Body HTML from GrapesJS
 * @param {string} css - CSS from GrapesJS
 * @param {object} seo - SEO metadata
 * @returns {Promise<{url, previewId}>}
 */
export async function previewPage(html, css, seo) {
  return callDeployApi('preview_page', {
    html,
    css,
    seo,
  })
}
