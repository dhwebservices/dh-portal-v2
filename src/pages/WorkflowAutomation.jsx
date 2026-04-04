import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Play, Sparkles, Zap } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { sendManagedNotification } from '../utils/notificationPreferences'
import {
  buildWorkflowPreviewRows,
  buildWorkflowRuleKey,
  createWorkflowRule,
  executeWorkflowRun,
  loadWorkflowAutomationData,
  WORKFLOW_CATEGORY_OPTIONS,
  WORKFLOW_RECIPIENT_OPTIONS,
  WORKFLOW_TRIGGER_OPTIONS,
} from '../utils/workflowAutomation'

const EMPTY_FORM = {
  title: '',
  description: '',
  trigger_type: 'support_breached',
  recipient_mode: 'auto',
  recipient_email: '',
  recipient_name: '',
  notification_category: 'general',
  notify_by_email: true,
  cooldown_hours: 24,
  min_client_health: 'watch',
  active: true,
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat-card" style={{ minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div className="stat-lbl">{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}22`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="stat-val">{value}</div>
      <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

function formatRelative(dateString = '') {
  if (!dateString) return 'Never'
  const diffMs = Date.now() - new Date(dateString).getTime()
  const hours = Math.round(diffMs / (60 * 60 * 1000))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export default function WorkflowAutomation() {
  const { user } = useAuth()
  const [rules, setRules] = useState([])
  const [noticeMap, setNoticeMap] = useState({})
  const [runs, setRuns] = useState([])
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const load = async () => {
    setLoading(true)
    const data = await loadWorkflowAutomationData()
    setRules(data.rules || [])
    setNoticeMap(data.noticeMap || {})
    setRuns(data.runs || [])
    setContext(data.context || null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  const openEdit = (rule) => {
    setEditing(rule)
    setForm({
      title: rule.title || '',
      description: rule.description || '',
      trigger_type: rule.trigger_type || 'support_breached',
      recipient_mode: rule.recipient_mode || 'auto',
      recipient_email: rule.recipient_email || '',
      recipient_name: rule.recipient_name || '',
      notification_category: rule.notification_category || 'general',
      notify_by_email: rule.notify_by_email !== false,
      cooldown_hours: rule.cooldown_hours || 24,
      min_client_health: rule.min_client_health || 'watch',
      active: rule.active !== false,
    })
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditing(null)
    setEditorOpen(false)
    setForm(EMPTY_FORM)
  }

  const saveRule = async () => {
    const base = createWorkflowRule(editing || {})
    const next = createWorkflowRule({
      ...base,
      ...form,
      updated_at: new Date().toISOString(),
      created_at: editing?.created_at || base.created_at,
      created_by_email: editing?.created_by_email || user?.email || '',
      created_by_name: editing?.created_by_name || user?.name || '',
    })

    setSaving(true)
    await supabase.from('portal_settings').upsert({
      key: buildWorkflowRuleKey(next.id),
      value: { value: next },
    }, { onConflict: 'key' })
    setSaving(false)
    closeEditor()
    await load()
  }

  const deleteRule = async (rule) => {
    if (!confirm(`Delete automation rule "${rule.title}"?`)) return
    await supabase.from('portal_settings').delete().eq('key', buildWorkflowRuleKey(rule.id))
    await load()
  }

  const previewRows = useMemo(() => {
    return buildWorkflowPreviewRows(rules, context, noticeMap)
  }, [context, noticeMap, rules])

  const stats = useMemo(() => ({
    activeRules: rules.filter((rule) => rule.active !== false).length,
    liveMatches: previewRows.length,
    readyNow: previewRows.filter((row) => row.recipient.email && !row.coolingDown).length,
    sentToday: runs.filter((run) => new Date(run.created_at).toDateString() === new Date().toDateString()).reduce((sum, run) => sum + Number(run.totals?.sent || 0), 0),
  }), [previewRows, rules, runs])

  const executeRun = async ({ previewOnly }) => {
    if (!context) return
    setRunning(true)
    const { runRecord, nextNoticeMap } = await executeWorkflowRun({
      previewRows,
      previewOnly,
      user,
      sendNotification: sendManagedNotification,
    })

    if (!previewOnly) {
      setNoticeMap((prev) => ({ ...prev, ...nextNoticeMap }))
      setRuns((prev) => [runRecord, ...prev].slice(0, 20))
    }

    setLastRun(runRecord)
    setRunning(false)
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Workflow Automation</h1>
          <p className="page-sub">Run rules across support, HR, compliance, training, and client risk signals, then notify the right people without leaving the portal.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={load}>Refresh</button>
          <button className="btn btn-outline" onClick={() => executeRun({ previewOnly: true })} disabled={loading || running}>Preview run</button>
          <button className="btn btn-primary" onClick={() => executeRun({ previewOnly: false })} disabled={loading || running}>{running ? 'Running...' : 'Run automations'}</button>
          <button className="btn btn-primary" onClick={openCreate}>New rule</button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={Zap} label="Active rules" value={stats.activeRules} hint="Automation rules currently evaluating live portal signals." tone="var(--blue)" />
        <StatCard icon={Sparkles} label="Live matches" value={stats.liveMatches} hint="Current incidents matching the active rule library." tone="var(--green)" />
        <StatCard icon={Play} label="Ready now" value={stats.readyNow} hint="Matches with a recipient resolved and no cooldown blocking delivery." tone="var(--amber)" />
        <StatCard icon={AlertTriangle} label="Sent today" value={stats.sentToday} hint="Notifications delivered from workflow runs today." tone="var(--red)" />
      </div>

      <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 18 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>Rule library</div>
              <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 6 }}>Store reusable triggers, recipients, and cooldown rules.</div>
            </div>
          </div>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : !rules.length ? (
            <div style={{ padding: 30, color: 'var(--faint)', textAlign: 'center' }}>No workflow rules yet.</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {rules.map((rule, index) => {
                const ruleMatches = previewRows.filter((row) => row.rule.id === rule.id)
                return (
                  <div key={rule.id} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--border)', display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{rule.title || 'Untitled rule'}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>{rule.description || 'No description yet.'}</div>
                      </div>
                      <span className={`badge badge-${rule.active !== false ? 'green' : 'grey'}`}>{rule.active !== false ? 'active' : 'inactive'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge badge-blue">{WORKFLOW_TRIGGER_OPTIONS.find(([key]) => key === rule.trigger_type)?.[1] || rule.trigger_type}</span>
                      <span className="badge badge-grey">{WORKFLOW_RECIPIENT_OPTIONS.find(([key]) => key === rule.recipient_mode)?.[1] || rule.recipient_mode}</span>
                      <span className="badge badge-grey">{rule.cooldown_hours}h cooldown</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                      {rule.recipient_email ? `Manual fallback: ${rule.recipient_email}` : 'No manual fallback recipient set.'}
                      <br />
                      {ruleMatches.length} current match{ruleMatches.length === 1 ? '' : 'es'}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(rule)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRule(rule)}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>Current matches</div>
            <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 6 }}>Preview which records would notify right now and which ones are being held by cooldown.</div>
          </div>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : !previewRows.length ? (
            <div style={{ padding: 30, color: 'var(--faint)', textAlign: 'center' }}>No current records match the active automation rules.</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {previewRows.slice(0, 14).map((row, index) => (
                <div key={`${row.rule.id}:${row.incident.id}`} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--border)', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.incident.title}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>{row.incident.message}</div>
                    </div>
                    <span className={`badge badge-${row.coolingDown ? 'grey' : row.recipient.email ? 'green' : 'red'}`}>
                      {row.coolingDown ? 'cooldown' : row.recipient.email ? 'ready' : 'no recipient'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-blue">{row.rule.title}</span>
                    <span className="badge badge-grey">{row.recipient.email || 'No recipient resolved'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                    Last sent: {row.lastSentAt ? `${new Date(row.lastSentAt).toLocaleString('en-GB')} (${formatRelative(row.lastSentAt)})` : 'Never'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>Run history</div>
            <div style={{ fontSize: 14, color: 'var(--sub)', marginTop: 6 }}>Recent previews and live deliveries from this automation desk.</div>
          </div>
        </div>

        {(lastRun || runs[0]) ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[lastRun, ...runs].filter(Boolean).filter((run, index, arr) => arr.findIndex((item) => item.id === run.id) === index).slice(0, 6).map((run) => (
              <div key={run.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{run.preview_only ? 'Preview run' : 'Live run'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>
                      {new Date(run.created_at).toLocaleString('en-GB')} by {run.created_by_name || run.created_by_email || 'Unknown user'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-blue">{run.totals?.matches || 0} matches</span>
                    <span className="badge badge-green">{run.totals?.sent || 0} sent</span>
                    <span className="badge badge-grey">{run.totals?.skipped || 0} skipped</span>
                    <span className="badge badge-red">{run.totals?.failed || 0} failed</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--faint)' }}>No automation runs yet.</div>
        )}
      </div>

      {editorOpen ? (
        <Modal
          title={editing ? `Edit Automation${editing?.title ? ` — ${editing.title}` : ''}` : 'New Automation Rule'}
          onClose={closeEditor}
          width={760}
          footer={(
            <>
              <button className="btn btn-outline" onClick={closeEditor}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRule} disabled={saving}>{saving ? 'Saving...' : 'Save rule'}</button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="grid-2">
              <div>
                <label className="lbl">Rule title</label>
                <input className="inp" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Escalate breached support tickets" />
              </div>
              <div>
                <label className="lbl">Trigger</label>
                <select className="inp" value={form.trigger_type} onChange={(e) => setForm((prev) => ({ ...prev, trigger_type: e.target.value }))}>
                  {WORKFLOW_TRIGGER_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="lbl">Description</label>
              <textarea className="inp" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Tell the team what this automation is responsible for." />
            </div>

            <div className="grid-2">
              <div>
                <label className="lbl">Recipient mode</label>
                <select className="inp" value={form.recipient_mode} onChange={(e) => setForm((prev) => ({ ...prev, recipient_mode: e.target.value }))}>
                  {WORKFLOW_RECIPIENT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Notification category</label>
                <select className="inp" value={form.notification_category} onChange={(e) => setForm((prev) => ({ ...prev, notification_category: e.target.value }))}>
                  {WORKFLOW_CATEGORY_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label className="lbl">Manual recipient email</label>
                <input className="inp" value={form.recipient_email} onChange={(e) => setForm((prev) => ({ ...prev, recipient_email: e.target.value.toLowerCase() }))} placeholder="Fallback or fixed recipient" />
              </div>
              <div>
                <label className="lbl">Manual recipient name</label>
                <input className="inp" value={form.recipient_name} onChange={(e) => setForm((prev) => ({ ...prev, recipient_name: e.target.value }))} placeholder="Optional display name" />
              </div>
            </div>

            <div className="grid-2">
              <div>
                <label className="lbl">Cooldown hours</label>
                <input className="inp" type="number" min="1" max="168" value={form.cooldown_hours} onChange={(e) => setForm((prev) => ({ ...prev, cooldown_hours: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Client risk threshold</label>
                <select className="inp" value={form.min_client_health} onChange={(e) => setForm((prev) => ({ ...prev, min_client_health: e.target.value }))} disabled={form.trigger_type !== 'client_risk'}>
                  <option value="watch">Watch or higher</option>
                  <option value="high_risk">High risk only</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <input type="checkbox" checked={form.notify_by_email} onChange={(e) => setForm((prev) => ({ ...prev, notify_by_email: e.target.checked }))} />
                Allow email delivery if the recipient prefers it
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
                Rule active
              </label>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
