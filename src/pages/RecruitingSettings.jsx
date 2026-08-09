import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SubNav from '../components/SubNav'
import { Button, FormField, FormLabel } from '../components/ds'
import { getRecruitingSetting, upsertRecruitingSetting } from '../utils/recruiting'

export default function RecruitingSettings() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [settings, setSettings] = useState({ acknowledgement: '', defaultQuestions: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      getRecruitingSetting('acknowledgement', ''),
      getRecruitingSetting('defaultQuestions', ''),
    ]).then(([acknowledgement, defaultQuestions]) => {
      setSettings({ acknowledgement, defaultQuestions })
    })
  }, [])

  const save = async () => {
    setSaving(true)
    await Promise.all([
      upsertRecruitingSetting('acknowledgement', settings.acknowledgement),
      upsertRecruitingSetting('defaultQuestions', settings.defaultQuestions),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Recruiting settings</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Keep the default commission acknowledgement and reusable question copy in one place.</p>
        </div>
      </div>

      <SubNav items={[
        { label: 'Dashboard', onClick: () => navigate('/recruiting/dashboard') },
        can('recruiting_jobs') && { label: 'Jobs', onClick: () => navigate('/recruiting') },
        can('recruiting_applications') && { label: 'Applications', onClick: () => navigate('/recruiting/applications') },
        can('recruiting_board') && { label: 'Board', onClick: () => navigate('/recruiting/board') },
        { label: 'Settings', active: true, onClick: () => {} },
      ]} />

      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20, display: 'grid', gap: 16, maxWidth: 860 }}>
        <FormField>
          <FormLabel>Commission acknowledgement copy</FormLabel>
          <textarea className="ds-form-input" rows={4} value={settings.acknowledgement} onChange={(e) => setSettings((current) => ({ ...current, acknowledgement: e.target.value }))} style={{ resize: 'vertical', padding:'8px 12px' }} />
        </FormField>
        <FormField>
          <FormLabel>Default screening question bank</FormLabel>
          <textarea className="ds-form-input" rows={7} value={settings.defaultQuestions} onChange={(e) => setSettings((current) => ({ ...current, defaultQuestions: e.target.value }))} style={{ resize: 'vertical', padding:'8px 12px' }} placeholder="One reusable question per line" />
        </FormField>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</Button>
          {saved ? <span style={{ fontSize: 12.5, color: 'var(--color-green-500)' }}>Saved</span> : null}
        </div>
      </div>
    </div>
  )
}
