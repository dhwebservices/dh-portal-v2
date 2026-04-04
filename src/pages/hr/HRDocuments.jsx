import { useEffect, useMemo, useState } from 'react'
import { FileText, FolderOpen, ShieldAlert, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../utils/supabase'
import {
  mergeComplianceRecord,
  resolveRightToWorkRecord,
} from '../../utils/complianceRecords'

function daysUntil(dateString) {
  if (!dateString) return null
  return Math.ceil((new Date(dateString).getTime() - Date.now()) / 86400000)
}

function StatCard({ icon: Icon, label, value, hint, tone = 'var(--accent)' }) {
  return (
    <div className="stat-card" style={{ minHeight: 146, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${tone}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={tone} />
      </div>
      <div>
        <div className="stat-val">{value}</div>
        <div className="stat-lbl">{label}</div>
        {hint ? <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }) {
  return <div style={{ padding: '28px 18px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>{text}</div>
}

function getComplianceTone(status) {
  if (status === 'missing' || status === 'expired') return 'red'
  if (status === 'warning') return 'amber'
  return 'green'
}

function formatTimelineDate(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HRDocuments() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState([])
  const [documents, setDocuments] = useState([])
  const [payslips, setPayslips] = useState([])
  const [onboarding, setOnboarding] = useState([])
  const [complianceMap, setComplianceMap] = useState({})
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [staffRes, docsRes, payslipsRes, onboardingRes, complianceRes] = await Promise.all([
      supabase.from('hr_profiles').select('user_email,full_name,role,department,start_date').order('full_name'),
      supabase.from('staff_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('payslips').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('onboarding_submissions').select('user_email,user_name,rtw_type,rtw_document_url,rtw_expiry,status').order('submitted_at', { ascending: false }),
      supabase.from('portal_settings').select('key,value').like('key', 'staff_compliance:%'),
    ])

    setStaff(staffRes.data || [])
    setDocuments(docsRes.data || [])
    setPayslips(payslipsRes.data || [])
    setOnboarding(onboardingRes.data || [])
    setComplianceMap(Object.fromEntries((complianceRes.data || []).map((row) => {
      const email = String(row.key || '').replace('staff_compliance:', '').toLowerCase()
      return [email, mergeComplianceRecord(row.value?.value ?? row.value ?? {})]
    })))
    setLoading(false)
  }

  const docMap = useMemo(() => {
    return documents.reduce((acc, doc) => {
      const key = (doc.staff_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(doc)
      return acc
    }, {})
  }, [documents])

  const payslipMap = useMemo(() => {
    return payslips.reduce((acc, slip) => {
      const key = (slip.user_email || '').toLowerCase()
      acc[key] = acc[key] || []
      acc[key].push(slip)
      return acc
    }, {})
  }, [payslips])

  const onboardingMap = useMemo(() => {
    return onboarding.reduce((acc, row) => {
      acc[(row.user_email || '').toLowerCase()] = row
      return acc
    }, {})
  }, [onboarding])

  const contractGaps = useMemo(() => {
    return staff
      .filter((person) => person.user_email)
      .filter((person) => !(docMap[(person.user_email || '').toLowerCase()] || []).some((doc) => String(doc.type || '').toLowerCase().includes('contract') || String(doc.name || '').toLowerCase().includes('contract')))
      .map((person) => ({
        ...person,
        docCount: (docMap[(person.user_email || '').toLowerCase()] || []).length,
      }))
  }, [staff, docMap])

  const expiringRightToWork = useMemo(() => {
    return onboarding
      .filter((row) => row.rtw_expiry)
      .map((row) => ({ ...row, remaining: daysUntil(row.rtw_expiry) }))
      .filter((row) => row.remaining !== null && row.remaining <= 60)
      .sort((a, b) => a.remaining - b.remaining)
  }, [onboarding])

  const missingRightToWork = useMemo(() => {
    return onboarding
      .filter((row) => ['submitted', 'approved', 'in_progress'].includes(row.status))
      .filter((row) => !row.rtw_document_url)
  }, [onboarding])

  const payslipCoverage = useMemo(() => {
    return staff
      .filter((person) => person.user_email)
      .map((person) => ({
        ...person,
        payslipCount: (payslipMap[(person.user_email || '').toLowerCase()] || []).length,
      }))
      .sort((a, b) => a.payslipCount - b.payslipCount)
  }, [staff, payslipMap])

  const recentDocuments = useMemo(() => {
    return documents.slice(0, 10)
  }, [documents])

  const complianceRows = useMemo(() => {
    return staff
      .filter((person) => person.user_email)
      .map((person) => {
        const email = (person.user_email || '').toLowerCase()
        const personDocs = docMap[email] || []
        const personOnboarding = onboardingMap[email]
        const personCompliance = complianceMap[email]
        const personPayslips = payslipMap[email] || []
        const contractDoc = personDocs.find((doc) => String(doc.type || '').toLowerCase().includes('contract') || String(doc.name || '').toLowerCase().includes('contract'))
        const rtwRecord = resolveRightToWorkRecord(personOnboarding || {}, personDocs, personCompliance || {})
        const rtwRemaining = daysUntil(rtwRecord.expiry)

        const contractStatus = contractDoc ? 'ok' : 'missing'
        const rightToWorkStatus = !rtwRecord.hasDocument && !rtwRecord.rtw_override
          ? 'missing'
          : (rtwRemaining !== null && rtwRemaining < 0)
            ? 'expired'
            : (rtwRemaining !== null && rtwRemaining <= 45)
              ? 'warning'
              : 'ok'

        return {
          ...person,
          contractStatus,
          rightToWorkStatus,
          rtwRemaining,
          docCount: personDocs.length,
          payslipCount: personPayslips.length,
          latestDocAt: personDocs[0]?.created_at || null,
        }
      })
      .sort((a, b) => {
        const score = (row) => {
          if (row.contractStatus === 'missing') return 0
          if (row.rightToWorkStatus === 'missing' || row.rightToWorkStatus === 'expired') return 1
          if (row.rightToWorkStatus === 'warning') return 2
          return 3
        }
        return score(a) - score(b)
      })
  }, [staff, docMap, onboardingMap, payslipMap, complianceMap])

  const documentTimeline = useMemo(() => {
    const docEvents = documents.map((doc) => ({
      id: `doc-${doc.id}`,
      date: doc.created_at,
      title: doc.name,
      subtitle: `${doc.staff_name || doc.staff_email} · ${doc.type || 'Document'}`,
      tone: String(doc.type || '').toLowerCase().includes('contract') ? 'green' : 'blue',
      action: doc.file_url,
      actionLabel: 'Open file',
    }))

    const payslipEvents = payslips.map((slip) => ({
      id: `payslip-${slip.id}`,
      date: slip.uploaded_at,
      title: `Payslip uploaded: ${slip.period || 'Unknown period'}`,
      subtitle: slip.user_name || slip.user_email,
      tone: 'green',
      action: slip.file_url,
      actionLabel: 'Open payslip',
    }))

    const rtwEvents = onboarding
      .filter((row) => row.rtw_document_url || row.rtw_expiry)
      .map((row) => ({
        id: `rtw-${row.user_email}`,
        date: row.submitted_at || row.updated_at || row.created_at || null,
        title: row.rtw_document_url ? 'Right-to-work record updated' : 'Right-to-work expiry tracked',
        subtitle: `${row.user_name || row.user_email}${row.rtw_expiry ? ` · expires ${new Date(row.rtw_expiry).toLocaleDateString('en-GB')}` : ''}`,
        tone: row.rtw_document_url ? 'amber' : 'red',
        action: row.rtw_document_url || null,
        actionLabel: row.rtw_document_url ? 'Open RTW file' : null,
      }))

    return [...docEvents, ...payslipEvents, ...rtwEvents]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 12)
  }, [documents, payslips, onboarding])

  const filteredCoverage = filter === 'all'
    ? payslipCoverage
    : payslipCoverage.filter((row) => filter === 'missing' ? row.payslipCount === 0 : row.payslipCount > 0)

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">HR Documents</h1>
          <p className="page-sub">Document coverage, right-to-work risk, and payroll file health across the team.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate('/hr/compliance-rules')}>Open compliance rules</button>
        </div>
      </div>

      <div className="dashboard-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard icon={FolderOpen} label="Staff documents" value={documents.length} hint="Contracts and uploaded HR files stored in the portal." />
        <StatCard icon={FileText} label="Missing contracts" value={contractGaps.length} hint="Staff records without a contract file linked yet." tone="var(--amber)" />
        <StatCard icon={ShieldAlert} label="RTW issues" value={expiringRightToWork.length + missingRightToWork.length} hint="Expiring or missing right-to-work evidence needing review." tone="var(--red)" />
        <StatCard icon={Wallet} label="Payslips stored" value={payslips.length} hint="Payroll documents uploaded and available in staff accounts." tone="var(--green)" />
      </div>

      <div className="dashboard-panel-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18, marginBottom: 18 }}>
        <Panel title="Document gaps" subtitle="Staff profiles missing contract files or active onboarding records missing right-to-work uploads.">
          {!contractGaps.length && !missingRightToWork.length && !expiringRightToWork.length ? (
            <EmptyState text="No document risks found right now." />
          ) : (
            <div style={{ display: 'grid' }}>
              {contractGaps.slice(0, 6).map((person, index) => (
                <div key={`contract-${person.user_email}`} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{person.full_name || person.user_email}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>No contract file uploaded yet. Current document count: {person.docCount}.</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/my-staff/${encodeURIComponent(person.user_email.toLowerCase())}`)}>Open profile</button>
                </div>
              ))}
              {missingRightToWork.slice(0, 4).map((row, index) => (
                <div key={`rtw-missing-${row.user_email}`} style={{ padding: '15px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.user_name || row.user_email}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>Onboarding is {row.status} but no right-to-work document URL is attached.</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate('/hr/onboarding')}>Open onboarding</button>
                </div>
              ))}
              {expiringRightToWork.slice(0, 4).map((row) => (
                <div key={`rtw-expiry-${row.user_email}`} style={{ padding: '15px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{row.user_name || row.user_email}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>Right-to-work evidence expires in {row.remaining < 0 ? 'the past' : `${row.remaining} day${row.remaining === 1 ? '' : 's'}`}. Review before access or employment paperwork drifts.</div>
                  </div>
                  <span className={`badge badge-${row.remaining <= 14 ? 'red' : 'amber'}`}>{row.remaining <= 14 ? 'Urgent' : 'Upcoming'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent uploads" subtitle="Latest HR files added through staff profiles or payroll uploads.">
          {recentDocuments.length === 0 ? (
            <EmptyState text="No staff documents uploaded yet." />
          ) : (
            <div style={{ display: 'grid' }}>
              {recentDocuments.map((doc, index) => (
                <div key={doc.id} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{doc.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>{doc.staff_name || doc.staff_email} · {doc.type || 'Document'}</div>
                  </div>
                  <a className="btn btn-outline btn-sm" href={doc.file_url} target="_blank" rel="noreferrer">Open</a>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Payslip coverage" subtitle="Check which staff already have payroll files in the portal and which records still need uploading.">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`pill ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All staff</button>
          <button className={`pill ${filter === 'missing' ? 'on' : ''}`} onClick={() => setFilter('missing')}>Missing payslips</button>
          <button className={`pill ${filter === 'covered' ? 'on' : ''}`} onClick={() => setFilter('covered')}>With payslips</button>
        </div>
        {loading ? (
          <EmptyState text="Loading document coverage..." />
        ) : !filteredCoverage.length ? (
          <EmptyState text="No staff match this payslip view right now." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Role</th>
                  <th>Payslips</th>
                  <th>Documents</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCoverage.map((row) => (
                  <tr key={row.user_email}>
                    <td className="t-main">{row.full_name || row.user_email}</td>
                    <td>{row.role || '—'}</td>
                    <td><span className={`badge badge-${row.payslipCount === 0 ? 'amber' : 'green'}`}>{row.payslipCount}</span></td>
                    <td>{(docMap[(row.user_email || '').toLowerCase()] || []).length}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/my-staff/${encodeURIComponent(row.user_email.toLowerCase())}`)}>Open profile</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div style={{ height: 18 }} />

      <Panel title="Compliance overview" subtitle="Quickly assess contract coverage, right-to-work health, and recent document activity per staff member.">
        {loading ? (
          <EmptyState text="Loading compliance overview..." />
        ) : !complianceRows.length ? (
          <EmptyState text="No staff compliance rows available right now." />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Contract</th>
                  <th>Right to work</th>
                  <th>Payslips</th>
                  <th>Latest file</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {complianceRows.map((row) => (
                  <tr key={row.user_email}>
                    <td className="t-main">{row.full_name || row.user_email}</td>
                    <td>
                      <span className={`badge badge-${getComplianceTone(row.contractStatus)}`}>
                        {row.contractStatus === 'ok' ? 'On file' : 'Missing'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${getComplianceTone(row.rightToWorkStatus)}`}>
                        {row.rightToWorkStatus === 'ok'
                          ? 'Valid'
                          : row.rightToWorkStatus === 'warning'
                            ? `${row.rtwRemaining}d left`
                            : row.rightToWorkStatus === 'expired'
                              ? 'Expired'
                              : 'Missing'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${row.payslipCount === 0 ? 'amber' : 'green'}`}>{row.payslipCount}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {row.latestDocAt ? new Date(row.latestDocAt).toLocaleDateString('en-GB') : 'No upload'}
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/my-staff/${encodeURIComponent(row.user_email.toLowerCase())}`)}>Open profile</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div style={{ height: 18 }} />

      <Panel title="Document timeline" subtitle="Recent document, payroll, and right-to-work activity across the team.">
        {!documentTimeline.length ? (
          <EmptyState text="No document activity recorded yet." />
        ) : (
          <div style={{ display: 'grid' }}>
            {documentTimeline.map((item, index) => (
              <div key={item.id} style={{ padding: '15px 18px', borderTop: index === 0 ? 'none' : '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge badge-${item.tone}`}>{item.tone === 'green' ? 'Compliant' : item.tone === 'amber' ? 'Review' : 'Risk'}</span>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 5 }}>{item.subtitle}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>{formatTimelineDate(item.date)}</div>
                </div>
                {item.action ? <a className="btn btn-outline btn-sm" href={item.action} target="_blank" rel="noreferrer">{item.actionLabel || 'Open'}</a> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
