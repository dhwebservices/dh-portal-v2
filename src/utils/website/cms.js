/**
 * Client for the website CMS endpoint and the site's block manifest.
 *
 * Everything that writes goes through /api/website-cms with a verified Entra
 * token. Nothing here talks to Supabase directly - the browser has no business
 * holding write access to the public website.
 */

import { callPortalApi } from '../portalApi'

/**
 * Where the editor frames the site. Pointed at the branch preview while the
 * block engine is still off main; set VITE_PUBLIC_SITE_ORIGIN to change it
 * without a code edit.
 */
export const SITE_ORIGIN =
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN
  || 'https://website-editor-blocks.dh-website-djh.pages.dev'

export const EDIT_PROTOCOL = 'dh-website-editor/v1'

let manifestPromise = null

/**
 * Block definitions from the deployed site. The editor only ever offers blocks
 * the live build can actually render, which is what stops the two repos
 * drifting apart.
 */
export function loadBlockManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${SITE_ORIGIN}/block-manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest unavailable (${response.status}).`)
        return response.json()
      })
      .catch((error) => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}

export function listPages(instance, account) {
  return callPortalApi(instance, account, '/api/website-cms', { action: 'list_pages' })
}

export function getPage(instance, account, slug) {
  return callPortalApi(instance, account, '/api/website-cms', { action: 'get_page', slug })
}

export function importPage(instance, account, slug, overwrite = false) {
  return callPortalApi(instance, account, '/api/website-cms', { action: 'import_page', slug, overwrite })
}

export function saveDraft(instance, account, slug, document) {
  return callPortalApi(instance, account, '/api/website-cms', { action: 'save_draft', slug, document })
}

export function publishPage(instance, account, slug) {
  return callPortalApi(instance, account, '/api/website-cms', { action: 'publish_page', slug })
}

/* ── document helpers ───────────────────────────────────────────────────── */

export function newBlockId() {
  return `b-${crypto.randomUUID().slice(0, 8)}`
}

export function createBlock(definition) {
  return {
    id: newBlockId(),
    type: definition.type,
    props: structuredClone(definition.defaults || {}),
  }
}

export function moveBlock(document, fromIndex, toIndex) {
  const blocks = [...(document.blocks || [])]
  if (fromIndex < 0 || fromIndex >= blocks.length) return document
  const target = Math.max(0, Math.min(blocks.length - 1, toIndex))
  const [moved] = blocks.splice(fromIndex, 1)
  blocks.splice(target, 0, moved)
  return { ...document, blocks }
}

export function insertBlock(document, block, atIndex) {
  const blocks = [...(document.blocks || [])]
  const index = atIndex === undefined || atIndex === null ? blocks.length : atIndex
  blocks.splice(Math.max(0, Math.min(blocks.length, index)), 0, block)
  return { ...document, blocks }
}

export function removeBlock(document, blockId) {
  return { ...document, blocks: (document.blocks || []).filter((b) => b.id !== blockId) }
}

export function duplicateBlock(document, blockId) {
  const blocks = [...(document.blocks || [])]
  const index = blocks.findIndex((b) => b.id === blockId)
  if (index === -1) return document
  blocks.splice(index + 1, 0, { ...structuredClone(blocks[index]), id: newBlockId() })
  return { ...document, blocks }
}

export function patchBlockProps(document, blockId, patch) {
  return {
    ...document,
    blocks: (document.blocks || []).map((block) => (
      block.id === blockId ? { ...block, props: { ...block.props, ...patch } } : block
    )),
  }
}
