import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SubNav from '../components/SubNav'
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
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Recruiting settings</h1>
          <p className="page-sub">Keep the default commission acknowledgement and reusable question copy in one place.</p>
        </div>
      </div>

      <SubNav items={[
        can('recruiting_jobs') && { label: 'Jobs', onClick: () => navigate('/recruiting') },
        can('recruiting_applications') && { label: 'Applications', onClick: () => navigate('/recruiting/applications') },
        can('recruiting_board') && { label: 'Board', onClick: () => navigate('/recruiting/board') },
        { label: 'Settings', active: true, onClick: () => {} },
      ]} />

      <div className="card card-pad" style={{ display: 'grid', gap: 16, maxWidth: 860 }}>
        <div>
          <label className="lbl">Commission acknowledgement copy</label>
          <textarea className="inp" rows={4} value={settings.acknowledgement} onChange={(e) => setSettings((current) => ({ ...current, acknowledgement: e.target.value }))} style={{ resize: 'vertical' }} />
        </div>
        <div>
          <label className="lbl">Default screening question bank</label>
          <textarea className="inp" rows={7} value={settings.defaultQuestions} onChange={(e) => setSettings((current) => ({ ...current, defaultQuestions: e.target.value }))} style={{ resize: 'vertical' }} placeholder="One reusable question per line" />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save settings'}</button>
          {saved ? <span style={{ fontSize: 12.5, color: 'var(--green)' }}>Saved</span> : null}
        </div>
      </div>
    </div>
  )
}
