/**
 * The pages of the public website.
 *
 * Deliberately shows the real pages rather than only the ones already in the
 * database: a page that has never been edited still needs to be findable and
 * openable, otherwise the editor looks empty for a site that plainly is not.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import SubNav from '../../components/SubNav'
import { useAuth } from '../../contexts/AuthContext'
import { Button, Alert, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, FormField, FormLabel, FormInput, FormHint } from '../../components/ds'
import { listPages, loadBlockManifest, createPage, slugify, SITE_ORIGIN } from '../../utils/website/cms'

export default function PageList() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const { instance, accounts } = useMsal()
  const account = accounts?.[0]

  const [pages, setPages] = useState([])
  const [importable, setImportable] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [result, manifest] = await Promise.all([
          listPages(instance, account),
          loadBlockManifest().catch(() => null),
        ])
        if (!active) return
        setPages(result.pages || [])
        setImportable(Object.keys(manifest?.documents || {}))
      } catch (err) {
        if (active) setError(err.message || 'Could not load pages.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [instance, account])

  if (loading) {
    return <div className="spin-wrap" style={{ minHeight: '40vh' }}><div className="spin" /></div>
  }

  const known = new Set(pages.map((p) => p.slug))
  const notYetTracked = importable.filter((slug) => !known.has(slug))

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Website</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} · dhwebsiteservices.co.uk
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : '+ New page'}
        </Button>
      </div>

      <SubNav items={[
        { label: 'Clients', onClick: () => navigate('/clients') },
        can('clientmgmt') && { label: 'Client Portal', onClick: () => navigate('/client-mgmt') },
        can('competitor') && { label: 'Competitor Lookup', onClick: () => navigate('/competitor') },
        can('domains') && { label: 'Domain Checker', onClick: () => navigate('/domains') },
        { label: 'Website Editor', active: true, onClick: () => {} },
        can('website_editor') && { label: 'Web Manager', onClick: () => navigate('/web-manager') },
      ]} />

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}

      {creating && (
        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', padding: 20, marginBottom: 16, maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>New page</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            Starts empty. Add sections in the editor, then publish — the address goes live at that point,
            not before.
          </div>

          <FormField>
            <FormLabel required>Title</FormLabel>
            <FormInput
              value={newTitle}
              placeholder="e.g. Web Design for Dentists"
              onChange={(e) => {
                setNewTitle(e.target.value)
                if (!slugEdited) setNewSlug(slugify(e.target.value))
              }}
            />
          </FormField>

          <FormField>
            <FormLabel required>Address</FormLabel>
            <FormInput
              value={newSlug}
              placeholder="web-design-for-dentists"
              onChange={(e) => { setSlugEdited(true); setNewSlug(slugify(e.target.value)) }}
            />
            <FormHint>dhwebsiteservices.co.uk/{newSlug || '…'}</FormHint>
          </FormField>

          <Button
            variant="primary"
            disabled={saving || !newTitle.trim() || !newSlug}
            onClick={async () => {
              setSaving(true); setError('')
              try {
                const result = await createPage(instance, account, { title: newTitle.trim(), slug: newSlug })
                navigate(`/website/edit/${result.page.slug}`)
              } catch (err) {
                setError(err.message)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Creating…' : 'Create and open'}
          </Button>
        </div>
      )}

      {SITE_ORIGIN.includes('pages.dev') ? (
        <div style={{ marginBottom: 16 }}>
          <Alert variant="info">
            The editor is pointed at a preview build of the site, not the live domain. Publishing still
            writes real content — only the canvas is the preview.
          </Alert>
        </div>
      ) : null}

      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
        <Table className="ds-table">
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last edited</TableHead>
              <TableHead style={{ width: 90 }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/website/edit/${page.slug}`)}>
                <TableCell style={{ fontWeight: 500 }}>{page.title}</TableCell>
                <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                  /{page.slug === 'home' ? '' : page.slug}
                </TableCell>
                <TableCell>
                  <StatusBadge variant={page.status === 'published' ? 'active' : 'neutral'}>
                    {page.status === 'published' ? 'Published' : 'Draft'}
                  </StatusBadge>
                </TableCell>
                <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                  {page.updated_at ? new Date(page.updated_at).toLocaleDateString('en-GB') : '—'}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="secondary" style={{ height: 26, fontSize: 12 }} onClick={() => navigate(`/website/edit/${page.slug}`)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {notYetTracked.length > 0 ? (
        <div style={{ marginTop: 20, fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Also on the site, not yet editable here: {notYetTracked.join(', ')}
        </div>
      ) : null}
    </div>
  )
}
