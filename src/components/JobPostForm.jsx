import { useMemo } from 'react'

function parseOptions(value = '') {
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean)
}

export default function JobPostForm({ value, onChange }) {
  const questions = useMemo(() => Array.isArray(value.screening_questions) ? value.screening_questions : [], [value.screening_questions])
  const departmentOptions = useMemo(
    () => Array.isArray(value.department_options) ? value.department_options.filter(Boolean) : [],
    [value.department_options]
  )
  const update = (key, next) => onChange({ ...value, [key]: next })

  const updateQuestion = (index, patch) => {
    const next = questions.slice()
    next[index] = { ...next[index], ...patch }
    update('screening_questions', next)
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Requisition</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>Approval details for opening and funding this role before it goes live.</div>
          </div>
          <span className={`badge badge-${value.requisition_status === 'approved' ? 'green' : value.requisition_status === 'pending_approval' ? 'amber' : value.requisition_status === 'rejected' ? 'red' : 'grey'}`}>
            {(value.requisition_status || 'draft').replace(/_/g, ' ')}
          </span>
        </div>

        <div className="fg">
          <div>
            <label className="lbl">Headcount requested</label>
            <input
              className="inp"
              type="number"
              min="1"
              value={value.headcount_requested || 1}
              onChange={(e) => update('headcount_requested', Math.max(1, Number(e.target.value || 1)))}
            />
          </div>
          <div>
            <label className="lbl">Priority</label>
            <select className="inp" value={value.requisition_priority || 'standard'} onChange={(e) => update('requisition_priority', e.target.value)}>
              <option value="low">Low</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="lbl">Planned start date</label>
            <input className="inp" type="date" value={value.planned_start_date || ''} onChange={(e) => update('planned_start_date', e.target.value)} />
          </div>
          <div>
            <label className="lbl">Budget owner</label>
            <input className="inp" value={value.budget_owner || ''} onChange={(e) => update('budget_owner', e.target.value)} placeholder="Who owns the hiring budget?" />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="lbl">Vacancy reason</label>
          <textarea
            className="inp"
            rows={3}
            value={value.vacancy_reason || ''}
            onChange={(e) => update('vacancy_reason', e.target.value)}
            style={{ resize: 'vertical' }}
            placeholder="Why is this role needed? New headcount, replacement, growth, delivery pressure, etc."
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="lbl">Approval notes</label>
          <textarea
            className="inp"
            rows={3}
            value={value.approval_notes || ''}
            onChange={(e) => update('approval_notes', e.target.value)}
            style={{ resize: 'vertical' }}
            placeholder="Any context the approver should see before signing this role off."
          />
        </div>
      </div>

      <div className="fg">
        <div><label className="lbl">Title</label><input className="inp" value={value.title || ''} onChange={(e) => update('title', e.target.value)} /></div>
        <div><label className="lbl">Slug</label><input className="inp" value={value.slug || ''} onChange={(e) => update('slug', e.target.value)} placeholder="leave blank to auto-generate" /></div>
        <div><label className="lbl">Department</label>
          <select className="inp" value={value.department || ''} onChange={(e) => update('department', e.target.value)}>
            <option value="">{departmentOptions.length ? 'Choose department' : 'No departments available'}</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
        </div>
        <div><label className="lbl">Hiring Manager Full Name</label><input className="inp" value={value.hiring_manager_name || ''} onChange={(e) => update('hiring_manager_name', e.target.value)} placeholder="e.g. David Hooper" /></div>
        <div><label className="lbl">Hiring Manager Email</label><input className="inp" type="email" value={value.hiring_manager_email || ''} onChange={(e) => update('hiring_manager_email', e.target.value)} placeholder="e.g. HR@dhwebsiteservices.co.uk" /></div>
        <div><label className="lbl">Employment Type</label>
          <select className="inp" value={value.employment_type || 'full_time'} onChange={(e) => update('employment_type', e.target.value)}>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div><label className="lbl">Location Type</label>
          <select className="inp" value={value.location_type || 'remote'} onChange={(e) => update('location_type', e.target.value)}>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="office">Office</option>
            <option value="field">Field based</option>
          </select>
        </div>
        <div><label className="lbl">Location Text</label><input className="inp" value={value.location_text || ''} onChange={(e) => update('location_text', e.target.value)} placeholder="e.g. Cardiff / South Wales / UK-wide" /></div>
        <div><label className="lbl">Compensation Model</label>
          <select className="inp" value={value.compensation_model || 'commission_only'} onChange={(e) => update('compensation_model', e.target.value)}>
            <option value="commission_only">Commission only</option>
            <option value="salary">Salary</option>
            <option value="salary_plus_commission">Salary + commission</option>
          </select>
        </div>
        <div><label className="lbl">Salary / Package Text</label><input className="inp" value={value.salary_text || ''} onChange={(e) => update('salary_text', e.target.value)} placeholder="Optional package text shown publicly" /></div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text)' }}>
        <input type="checkbox" checked={value.commission_only === true} onChange={(e) => update('commission_only', e.target.checked)} />
        Applicant must confirm this is a commission-only role with no basic salary
      </label>

      <div><label className="lbl">Summary</label><textarea className="inp" rows={3} value={value.summary || ''} onChange={(e) => update('summary', e.target.value)} style={{ resize: 'vertical' }} /></div>
      <div><label className="lbl">Description</label><textarea className="inp" rows={6} value={value.description || ''} onChange={(e) => update('description', e.target.value)} style={{ resize: 'vertical' }} /></div>
      <div><label className="lbl">Responsibilities</label><textarea className="inp" rows={6} value={value.responsibilities || ''} onChange={(e) => update('responsibilities', e.target.value)} style={{ resize: 'vertical' }} /></div>
      <div><label className="lbl">Requirements</label><textarea className="inp" rows={6} value={value.requirements || ''} onChange={(e) => update('requirements', e.target.value)} style={{ resize: 'vertical' }} /></div>
      <div><label className="lbl">Benefits / What You Get</label><textarea className="inp" rows={5} value={value.benefits || ''} onChange={(e) => update('benefits', e.target.value)} style={{ resize: 'vertical' }} /></div>

      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Screening questions</div>
            <div style={{ fontSize: 12.5, color: 'var(--sub)', marginTop: 4 }}>These show on the public application form.</div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => update('screening_questions', [...questions, { id: `q_${questions.length + 1}`, label: '', type: 'textarea', required: true, help: '', options: [] }])}>Add question</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {questions.map((question, index) => (
            <div key={question.id || index} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--bg2)' }}>
              <div className="fg">
                <div className="fc"><label className="lbl">Question</label><input className="inp" value={question.label || ''} onChange={(e) => updateQuestion(index, { label: e.target.value })} /></div>
                <div><label className="lbl">Field Type</label>
                  <select className="inp" value={question.type || 'textarea'} onChange={(e) => updateQuestion(index, { type: e.target.value })}>
                    <option value="textarea">Long answer</option>
                    <option value="text">Short answer</option>
                    <option value="select">Select list</option>
                  </select>
                </div>
              </div>
              <div className="fg" style={{ marginTop: 12 }}>
                <div className="fc"><label className="lbl">Help Text</label><input className="inp" value={question.help || ''} onChange={(e) => updateQuestion(index, { help: e.target.value })} /></div>
                <div className="fc"><label className="lbl">Select Options</label><textarea className="inp" rows={3} value={(question.options || []).join('\n')} onChange={(e) => updateQuestion(index, { options: parseOptions(e.target.value) })} style={{ resize: 'vertical' }} placeholder="One option per line" /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)' }}>
                  <input type="checkbox" checked={question.required !== false} onChange={(e) => updateQuestion(index, { required: e.target.checked })} />
                  Required
                </label>
                <button className="btn btn-outline btn-sm" onClick={() => update('screening_questions', questions.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
              </div>
            </div>
          ))}
          {questions.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>No screening questions yet.</div> : null}
        </div>
      </div>
    </div>
  )
}
