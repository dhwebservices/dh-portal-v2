import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../utils/supabase'
import { Modal } from '../../components/Modal'
import { createTrainingRecord } from '../../utils/peopleOps'
import { mergeLifecycleRecord } from '../../utils/staffLifecycle'
import {
  buildComplianceRuleKey,
  createComplianceRule,
  evaluateComplianceRulesForStaff,
  normalizeComplianceRule,
} from '../../utils/complianceRules'
import { Button, FormField, FormLabel, FormInput, StatusBadge } from '../../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }
const TONE_TO_VARIANT = { green:'active', amber:'warning', red:'error', blue:'info', grey: 'neutral' }

const EMPTY_FORM = {
  title: '',
  description: '',
  role: '',
  department: '',
  lifecycle: '',
  required_documents: '',
  required_training_titles: '',
  required_training_categories: '',
  active: true,
}

function StatCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div style={{ ...DS_CARD, padding: 20, minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{label}</div>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: `${tone}22`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}

export default function HRComplianceRules() {
  const navigate = useNavigate()
  const [rules, setRules] = useState([])
  const [staff, setStaff] = useState([])
  const [documents, setDocuments] = useState([])
  const [trainingRecords, setTrainingRecords] = useState([])
  const [lifecycleByEmail, setLifecycleByEmail] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [rulesRes, staffRes, docsRes, trainingRes, lifecycleRes] = await Promise.all([
      supabase.from('portal_settings').select('key,value').like('key', 'compliance_rule:%'),
      supabase.from('hr_profiles').select('user_email,full_name,role,department').order('full_name'),
      supabase.from('staff_documents').select('staff_email,name,type,file_path,file_url'),
      supabase.from('portal_settings').select('key,value').like('key', 'training_record:%'),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_lifecycle:%'),
    ])

    setRules((rulesRes.data || []).map((row) => normalizeComplianceRule(row?.value?.value ?? row?.value ?? {})).sort((a, b) => a.title.localeCompare(b.title)))
    setStaff(staffRes.data || [])
    setDocuments(docsRes.data || [])
    setTrainingRecords((trainingRes.data || []).map((row) => createTrainingRecord({
      id: String(row.key || '').replace('training_record:', ''),
      ...(row?.value?.value ?? row?.value ?? {}),
    })))
    setLifecycleByEmail(Object.fromEntries((lifecycleRes.data || []).map((row) => [
      String(row.key || '').replace('staff_lifecycle:', '').toLowerCase(),
      mergeLifecycleRecord(row?.value?.value ?? row?.value ?? {}).state || '',
    ])))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const docsByEmail = useMemo(() => {
    return documents.reduce((acc, doc) => {
      const key = String(doc.staff_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(doc)
      return acc
    }, {})
  }, [documents])

  const trainingByEmail = useMemo(() => {
    return trainingRecords.reduce((acc, record) => {
      const key = String(record.staff_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(record)
      return acc
    }, {})
  }, [trainingRecords])

  const evaluations = useMemo(() => {
    return evaluateComplianceRulesForStaff(staff, rules.filter((rule) => rule.active !== false), {
      docsByEmail,
      trainingByEmail,
      lifecycleByEmail,
    })
      .filter((row) => row.evaluations.length > 0)
      .sort((a, b) => b.missingCount - a.missingCount)
  }, [docsByEmail, lifecycleByEmail, rules, staff, trainingByEmail])

  const stats = useMemo(() => ({
    activeRules: rules.filter((rule) => rule.active !== false).length,
    matchedStaff: evaluations.length,
    staffWithGaps: evaluations.filter((row) => row.missingCount > 0).length,
    missingItems: evaluations.reduce((sum, row) => sum + row.missingCount, 0),
  }), [evaluations, rules])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const openEdit = (rule) => {
    setEditing(rule)
    setForm({
      title: rule.title || '',
      description: rule.description || '',
      role: rule.role || '',
      department: rule.department || '',
      lifecycle: rule.lifecycle || '',
      required_documents: (rule.required_documents || []).join(', '),
      required_training_titles: (rule.required_training_titles || []).join(', '),
      required_training_categories: (rule.required_training_categories || []).join(', '),
      active: rule.active !== false,
    })
  }

  const closeEditor = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const saveRule = async () => {
    const base = createComplianceRule(editing || {})
    const next = createComplianceRule({
      ...base,
      ...form,
      updated_at: new Date().toISOString(),
      created_at: editing?.created_at || base.created_at,
    })

    setSaving(true)
    await supabase.from('portal_settings').upsert({
      key: buildComplianceRuleKey(next.id),
      value: { value: next },
    }, { onConflict: 'key' })
    setSaving(false)
    closeEditor()
    await load()
  }

  const deleteRule = async (rule) => {
    if (!confirm(`Delete rule "${rule.title}"?`)) return
    await supabase.from('portal_settings').delete().eq('key', buildComplianceRuleKey(rule.id))
    await load()
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Compliance Rules</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Define required documents and training by role, department, and lifecycle, then watch the gaps automatically.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => navigate('/hr/documents')}>Back to HR documents</Button>
          <Button variant="primary" onClick={openCreate}>New rule</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard icon={SlidersHorizontal} label="Active rules" value={stats.activeRules} hint="Rules currently evaluating staff records." tone="var(--color-blue-500)" />
        <StatCard icon={ShieldCheck} label="Matched staff" value={stats.matchedStaff} hint="Staff members currently in scope of at least one active rule." tone="var(--color-green-500)" />
        <StatCard icon={AlertTriangle} label="Staff with gaps" value={stats.staffWithGaps} hint="People missing one or more required items from their rule set." tone="var(--color-red-500)" />
        <StatCard icon={AlertTriangle} label="Missing items" value={stats.missingItems} hint="Total document and training gaps across all evaluated rules." tone="var(--color-amber-500)" />
      </div>

      <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 18 }}>
        <div style={{ ...DS_CARD, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Rule library</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 6 }}>Manage which staff need which evidence.</div>
            </div>
          </div>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : !rules.length ? (
            <div style={{ padding: 30, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No compliance rules yet.</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {rules.map((rule, index) => (
                <div key={rule.id} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--color-border)', display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{rule.title || 'Untitled rule'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 4 }}>{rule.description || 'No description yet.'}</div>
                    </div>
                    <StatusBadge variant={TONE_TO_VARIANT[rule.active !== false ? 'green' : 'grey'] || 'info'}>{rule.active !== false ? 'active' : 'inactive'}</StatusBadge>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {rule.role ? <StatusBadge variant="info">{rule.role}</StatusBadge> : null}
                    {rule.department ? <StatusBadge variant="info">{rule.department}</StatusBadge> : null}
                    {rule.lifecycle ? <StatusBadge variant="info">{rule.lifecycle}</StatusBadge> : null}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Docs: {(rule.required_documents || []).join(', ') || 'none'}<br />
                    Training: {[...(rule.required_training_titles || []), ...(rule.required_training_categories || []).map((item) => `category:${item}`)].join(', ') || 'none'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => openEdit(rule)}>Edit</Button>
                    <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => deleteRule(rule)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...DS_CARD, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>Rule outcomes</div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 6 }}>Staff currently affected by the active compliance rule set.</div>
          </div>
          {loading ? <div className="spin-wrap"><div className="spin" /></div> : !evaluations.length ? (
            <div style={{ padding: 30, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>No staff match the current active rules.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Role</th>
                    <th>Lifecycle</th>
                    <th>Rule count</th>
                    <th>Missing items</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((row) => (
                    <tr key={row.profile.user_email}>
                      <td>{row.profile.full_name || row.profile.user_email}</td>
                      <td>{row.profile.role || '—'}{row.profile.department ? ` · ${row.profile.department}` : ''}</td>
                      <td>{row.lifecycleState || 'active'}</td>
                      <td>{row.evaluations.length}</td>
                      <td>
                        <StatusBadge variant={TONE_TO_VARIANT[row.missingCount > 0 ? 'red' : 'green'] || 'info'}>{row.missingCount}</StatusBadge>
                      </td>
                      <td>
                        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => navigate(`/my-staff/${encodeURIComponent(String(row.profile.user_email || '').toLowerCase())}`)}>Open profile</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && evaluations.length ? (
            <div style={{ padding: '16px 18px', borderTop: '1px solid var(--color-border)', display: 'grid', gap: 10 }}>
              {evaluations.filter((row) => row.missingCount > 0).slice(0, 6).map((row) => (
                <div key={`${row.profile.user_email}-detail`} style={{ padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-gray-50)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{row.profile.full_name || row.profile.user_email}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                    {row.missing.map((item) => (
                      <div key={`${row.profile.user_email}-${item.rule.id}`}>
                        <strong style={{ color: 'var(--color-text-primary)' }}>{item.rule.title || 'Rule'}</strong>: {[
                          ...item.result.missing_documents.map((entry) => `doc ${entry}`),
                          ...item.result.missing_training_titles.map((entry) => `training ${entry}`),
                          ...item.result.missing_training_categories.map((entry) => `category ${entry}`),
                        ].join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {(editing || form.title || form.description || form.required_documents || form.required_training_titles || form.required_training_categories) ? (
        <Modal
          title={editing ? `Edit Rule${editing?.title ? ` — ${editing.title}` : ''}` : 'New Compliance Rule'}
          onClose={closeEditor}
          width={820}
          footer={(
            <>
              <Button variant="secondary" onClick={closeEditor}>Cancel</Button>
              <Button variant="primary" onClick={saveRule} disabled={saving || !form.title.trim()}>{saving ? 'Saving...' : editing ? 'Save rule' : 'Create rule'}</Button>
            </>
          )}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <FormField><FormLabel>Rule title</FormLabel><FormInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="New starter onboarding pack" /></FormField>
            <FormField><FormLabel>Description</FormLabel><FormInput value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Describe when this rule applies and what it enforces." /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <FormField><FormLabel>Role</FormLabel><FormInput value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))} placeholder="Optional exact role" /></FormField>
              <FormField><FormLabel>Department</FormLabel><FormInput value={form.department} onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))} placeholder="Optional department" /></FormField>
              <FormField><FormLabel>Lifecycle</FormLabel><FormInput value={form.lifecycle} onChange={(e) => setForm((prev) => ({ ...prev, lifecycle: e.target.value }))} placeholder="Optional lifecycle state" /></FormField>
            </div>
            <FormField><FormLabel>Required document keywords</FormLabel><FormInput value={form.required_documents} onChange={(e) => setForm((prev) => ({ ...prev, required_documents: e.target.value }))} placeholder="contract, right to work, NDA" /></FormField>
            <FormField><FormLabel>Required training titles</FormLabel><FormInput value={form.required_training_titles} onChange={(e) => setForm((prev) => ({ ...prev, required_training_titles: e.target.value }))} placeholder="Microsoft Company Portal setup, Data protection induction" /></FormField>
            <FormField><FormLabel>Required training categories</FormLabel><FormInput value={form.required_training_categories} onChange={(e) => setForm((prev) => ({ ...prev, required_training_categories: e.target.value }))} placeholder="compliance, systems, certification" /></FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
              Rule is active
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
