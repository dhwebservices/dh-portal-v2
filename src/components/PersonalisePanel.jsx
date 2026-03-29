import { useState } from 'react'
import { Palette, Type, LayoutGrid, X, Save, RefreshCw, Lock } from 'lucide-react'
import { Btn } from './UI'

const ACCENTS = [
  { label: 'Cyan',    value: 'var(--gold)' },
  { label: 'Blue',    value: '#3B82F6' },
  { label: 'Purple',  value: '#8B5CF6' },
  { label: 'Pink',    value: '#EC4899' },
  { label: 'Orange',  value: '#F97316' },
  { label: 'Teal',    value: '#14B8A6' },
  { label: 'Lime',    value: '#84CC16' },
  { label: 'White',   value: '#F8FAFC' },
]

const GREENS  = ['#00E5A0','#22C55E','#10B981','#34D399','#86EFAC']
const AMBERS  = ['#FFB800','#F59E0B','#EAB308','#FBBF24','#FDE047']
const REDS    = ['#FF4D6A','#EF4444','#F43F5E','#FB923C','#FF6B6B']
const FONTS   = ['Inter','Poppins','Roboto','Mono']
const SIZES   = [{ key:'small',label:'Small' },{ key:'normal',label:'Normal' },{ key:'large',label:'Large' }]

const BLOCKS  = [
  { key: 'stats',      label: 'Stats Cards'      },
  { key: 'chart',      label: 'MRR Chart'        },
  { key: 'quicklinks', label: 'Quick Links'      },
  { key: 'status',     label: 'System Status'    },
  { key: 'suggest',    label: 'Suggest Feature'  },
]

export default function PersonalisePanel({ prefs, onSave, onClose, isAdmin = false }) {
  const [local, setLocal]   = useState({ ...prefs })
  const [tab, setTab]       = useState('colours')
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(null)

  const u = (k, v) => setLocal(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(local)
    setSaving(false)
    onClose()
  }

  const dragStart = (key) => setDragging(key)
  const dragOver = (e, key) => {
    e.preventDefault()
    if (!dragging || dragging === key) return
    const order = [...(local.blockOrder || BLOCKS.map(b => b.key))]
    const fromIdx = order.indexOf(dragging)
    const toIdx   = order.indexOf(key)
    if (fromIdx < 0 || toIdx < 0) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, dragging)
    u('blockOrder', order)
  }
  const dragEnd = () => setDragging(null)

  const toggleHidden = (key) => {
    const hidden = local.hiddenBlocks || []
    u('hiddenBlocks', hidden.includes(key) ? hidden.filter(k => k !== key) : [...hidden, key])
  }

  const TABS = [
    { key: 'colours', label: '🎨 Colours', icon: Palette },
    { key: 'fonts',   label: '✏️ Text',    icon: Type    },
    { key: 'layout',  label: '⊞ Layout',   icon: LayoutGrid },
  ]

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px', zIndex: 500,
      background: 'var(--card)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
      animation: 'slideInRight 0.25s ease',
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

      {/* Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '16px' }}>Personalise</div>
          <div style={{ fontSize: '12px', color: 'var(--sub)', marginTop: '2px' }}>Changes only affect your account</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer' }}><X size={18} /></button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? 'var(--gold)' : 'var(--sub)',
            borderBottom: `2px solid ${tab === t.key ? 'var(--gold)' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {tab === 'colours' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Section label="Accent Colour">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ACCENTS.map(a => (
                  <button key={a.value} onClick={() => u('colorAccent', a.value)} title={a.label} style={{
                    width: 32, height: 32, borderRadius: '8px', background: a.value, border: `2px solid ${local.colorAccent === a.value ? '#fff' : 'transparent'}`,
                    cursor: 'pointer', boxShadow: local.colorAccent === a.value ? `0 0 0 3px ${a.value}50` : 'none',
                    transition: 'all 0.15s',
                  }} />
                ))}
                <input type="color" value={local.colorAccent} onChange={e => u('colorAccent', e.target.value)}
                  style={{ width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} title="Custom colour" />
              </div>
            </Section>

            <Section label="Success / Green">
              <SwatchRow values={GREENS} active={local.colorGreen} onChange={v => u('colorGreen', v)} />
            </Section>

            <Section label="Warning / Amber">
              <SwatchRow values={AMBERS} active={local.colorAmber} onChange={v => u('colorAmber', v)} />
            </Section>

            <Section label="Danger / Red">
              <SwatchRow values={REDS} active={local.colorRed} onChange={v => u('colorRed', v)} />
            </Section>

            <Section label="Preview">
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[local.colorAccent, local.colorGreen, local.colorAmber, local.colorRed].map((c, i) => (
                  <div key={i} style={{ flex: 1, minWidth: '60px', height: '8px', borderRadius: '4px', background: c }} />
                ))}
              </div>
            </Section>
          </div>
        )}

        {tab === 'fonts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Section label="Font Family">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {FONTS.map(f => (
                  <button key={f} onClick={() => u('fontFamily', f)} style={{
                    padding: '10px 14px', borderRadius: '9px', border: '1px solid',
                    borderColor: local.fontFamily === f ? 'var(--gold)' : 'var(--border)',
                    background: local.fontFamily === f ? 'rgba(0,194,255,0.06)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: f === 'Mono' ? 'monospace' : f,
                    fontSize: '14px', color: local.fontFamily === f ? 'var(--gold)' : 'var(--text)',
                  }}>
                    {f} — The quick brown fox
                  </button>
                ))}
              </div>
            </Section>

            <Section label="Text Size">
              <div style={{ display: 'flex', gap: '8px' }}>
                {SIZES.map(s => (
                  <button key={s.key} onClick={() => u('fontSize', s.key)} style={{
                    flex: 1, padding: '10px', borderRadius: '9px', border: '1px solid',
                    borderColor: local.fontSize === s.key ? 'var(--gold)' : 'var(--border)',
                    background: local.fontSize === s.key ? 'rgba(0,194,255,0.06)' : 'transparent',
                    cursor: 'pointer', color: local.fontSize === s.key ? 'var(--gold)' : 'var(--text)',
                    fontSize: s.key === 'small' ? '12px' : s.key === 'large' ? '15px' : '13.5px',
                    fontWeight: local.fontSize === s.key ? 700 : 400,
                  }}>{s.label}</button>
                ))}
              </div>
            </Section>

            <Section label="Preview">
              <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: '9px', fontFamily: local.fontFamily === 'Mono' ? 'monospace' : local.fontFamily, fontSize: local.fontSize === 'small' ? '12px' : local.fontSize === 'large' ? '15.5px' : '14px', lineHeight: 1.6, color: 'var(--text)' }}>
                DH Website Services — Staff Portal preview text. This is how your interface will look with these settings applied.
              </div>
            </Section>
          </div>
        )}

        {tab === 'layout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--sub)', lineHeight: 1.6 }}>
              Drag blocks to reorder them on your dashboard. Toggle visibility with the eye button.
            </p>
            {(local.blockOrder || BLOCKS.map(b => b.key)).map(key => {
              const block = BLOCKS.find(b => b.key === key)
              if (!block) return null
              const hidden = (local.hiddenBlocks || []).includes(key)
              return (
                <div key={key}
                  draggable onDragStart={() => dragStart(key)} onDragOver={e => dragOver(e, key)} onDragEnd={dragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 14px', borderRadius: '10px',
                    background: dragging === key ? 'rgba(0,194,255,0.06)' : 'var(--bg2)',
                    border: `1px solid ${dragging === key ? 'var(--gold)' : 'var(--border)'}`,
                    cursor: 'grab', opacity: hidden ? 0.4 : 1, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ color: 'var(--faint)', fontSize: '16px', cursor: 'grab' }}>⠿</span>
                  <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 500, color: 'var(--text)' }}>{block.label}</span>
                  <button onClick={() => toggleHidden(key)} title={hidden ? 'Show' : 'Hide'} style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: hidden ? 'var(--faint)' : 'var(--gold)',
                  }}>{hidden ? '👁️' : '👁️'}</button>
                </div>
              )
            })}

            {isAdmin && (
              <div style={{ marginTop: '8px', padding: '12px 14px', background: 'rgba(0,194,255,0.05)', borderRadius: '10px', border: '1px solid rgba(0,194,255,0.2)' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--gold)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={12} /> Admin: Deploy to Everyone
                </div>
                <p style={{ fontSize: '12px', color: 'var(--sub)', marginBottom: '10px', lineHeight: 1.5 }}>
                  Save this layout as the default for all staff who haven't customised their dashboard.
                </p>
                <button onClick={async () => {
                  await fetch('https://xtunnfdwltfesscmpove.supabase.co/rest/v1/user_preferences', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM',
                      'Prefer': 'resolution=merge-duplicates',
                    },
                    body: JSON.stringify({ user_email: '__default__', preferences: local, updated_at: new Date().toISOString() }),
                  })
                  alert('Default layout deployed to all staff!')
                }} style={{ padding: '8px 14px', borderRadius: '8px', background: 'var(--gold)', color: '#fff', border: 'none', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                  Deploy as Default
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        <button onClick={() => setLocal({ ...prefs })} style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--sub)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={13} /> Reset
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Saving…' : '✓ Apply & Save'}
        </button>
      </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>{label}</div>
      {children}
  )
}

function SwatchRow({ values, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {values.map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          width: 28, height: 28, borderRadius: '7px', background: v, border: `2px solid ${active === v ? '#fff' : 'transparent'}`,
          cursor: 'pointer', boxShadow: active === v ? `0 0 0 3px ${v}60` : 'none', transition: 'all 0.15s',
        }} />
      ))}
      <input type="color" value={active} onChange={e => onChange(e.target.value)}
        style={{ width: 28, height: 28, borderRadius: '7px', border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
  )
}
