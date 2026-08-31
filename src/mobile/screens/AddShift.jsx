import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { loadActivePortalStaffAudience } from '../../utils/staffAudience'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import SectionHeader from '../components/SectionHeader'

/**
 * Putting somebody on the rota, from a phone.
 *
 * The mobile rota was read-only until now — shifts could only be created on
 * the web, which meant the one thing a manager most often wants to do standing
 * in the middle of a shop was the one thing the app could not do.
 *
 * Writes to `shifts`, the same table the web rota writes, with the same
 * columns. No schema change.
 *
 * Roles come from the values already in use rather than a roles table, which
 * does not exist here — so the picker offers what the business actually uses
 * and lets you type a new one.
 */
export default function MobileAddShift({ goBack, user, isAdmin, date: initialDate, shift: editing }) {
  const isEditing = !!editing?.id

  const [staff, setStaff] = useState([])
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState({
    employee: editing?.employee_email || '',
    date: editing?.shift_date || initialDate || new Date().toISOString().slice(0, 10),
    start: (editing?.start_time || '09:00').slice(0, 5),
    end: (editing?.end_time || '17:00').slice(0, 5),
    breakMinutes: editing?.break_minutes ?? 0,
    role: editing?.role || '',
    note: editing?.note || '',
    publish: editing ? !!editing.published : true,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin])

  const load = async () => {
    // Current staff only. The `staff` table includes people who have left and
    // misses portal accounts without a staff row — so the picker offered
    // leavers and omitted Jack, who has the app installed. One shared
    // definition of "who works here", the same one the message sender uses.
    const [people, { data: existing }] = await Promise.all([
      loadActivePortalStaffAudience(),
      supabase.from('shifts').select('role').not('role', 'is', null).limit(500),
    ])

    setStaff((people ?? []).filter(p => p.email))
    setRoles([...new Set((existing ?? []).map(r => r.role).filter(Boolean))].sort())
  }

  if (!isAdmin) {
    return <div className="add-shift"><p className="add-note">Only managers can add shifts.</p></div>
  }

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const hours = (() => {
    const mins = (t) => {
      const [h, m] = String(t || '').split(':').map(Number)
      return Number.isFinite(h) ? h * 60 + (m || 0) : null
    }
    const from = mins(form.start)
    const to = mins(form.end)
    if (from === null || to === null) return 0
    return Math.max(0, to - from - (Number(form.breakMinutes) || 0)) / 60
  })()

  const valid = form.employee && form.date && form.start && form.end && hours > 0

  const save = async () => {
    if (!valid || saving) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setSaving(true)
    setError('')

    const person = staff.find(p => p.email === form.employee)

    const row = {
      employee_email: form.employee,
      employee_name: person?.name || form.employee,
      shift_date: form.date,
      start_time: form.start,
      end_time: form.end,
      break_minutes: Number(form.breakMinutes) || 0,
      role: form.role || null,
      note: form.note || null,
      published: form.publish,
    }

    try {
      if (isEditing) {
        const { error: updateError } = await supabase
          .from('shifts')
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('shifts')
          .insert([{ ...row, created_by: user?.email || null }])
        if (insertError) throw insertError
      }

      await notify()
      await Haptics.impact({ style: ImpactStyle.Heavy })
      goBack()
    } catch (err) {
      setError(err.message || 'Could not save that shift.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Tells the person what happened to their shift.
   *
   * Three cases, and they are genuinely different to whoever is on the other
   * end: a shift appearing, a shift they already knew about moving, and a
   * draft nobody has seen yet — which is worth no notification at all,
   * because pinging somebody about a rota still being worked out is how they
   * learn to ignore the app.
   *
   * `sendManagedNotification` does the inbox row, the email and the push in
   * one call, honouring that person's preferences for each.
   */
  const notify = async () => {
    if (!form.publish) return

    const person = staff.find(p => p.email === form.employee)
    const when = new Date(form.date + 'T12:00:00')
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

    // Editing something that was already published is a CHANGE. Publishing a
    // previously-unpublished shift is new to them, whichever way it was made.
    const changed = isEditing && editing.published

    await sendManagedNotification({
      event: changed ? 'shift_changed' : 'shift_published',
      userEmail: form.employee,
      userName: person?.name || '',
      title: changed ? 'Your shift has changed' : 'New shift published',
      message: `${form.start}–${form.end} on ${when}${form.role ? ` as ${form.role}` : ''}.`,
      link: '/rota',
      type: 'info',
      category: 'schedule',
      sentBy: user?.name || user?.email,
    }).catch(() => {})
  }

  const remove = async () => {
    if (!isEditing || deleting) return
    if (!confirm('Delete this shift? They will be told it is cancelled.')) return

    await Haptics.impact({ style: ImpactStyle.Medium })
    setDeleting(true)
    setError('')

    try {
      const { error: deleteError } = await supabase.from('shifts').delete().eq('id', editing.id)
      if (deleteError) throw deleteError

      // Only if they had been told about it in the first place.
      if (editing.published) {
        const person = staff.find(p => p.email === editing.employee_email)
        const when = new Date(editing.shift_date + 'T12:00:00')
          .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

        await sendManagedNotification({
          event: 'shift_cancelled',
          userEmail: editing.employee_email,
          userName: person?.name || editing.employee_name || '',
          title: 'Shift cancelled',
          message: `Your shift on ${when} has been removed from the rota.`,
          link: '/rota',
          type: 'warning',
          category: 'schedule',
          sentBy: user?.name || user?.email,
        }).catch(() => {})
      }

      await Haptics.impact({ style: ImpactStyle.Heavy })
      goBack()
    } catch (err) {
      setError(err.message || 'Could not delete that shift.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="add-shift">
      <div className="add-head">
        <button className="add-back" onClick={goBack} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1>{isEditing ? 'Edit shift' : 'Add shift'}</h1>
      </div>

      <MobileCard>
        <SectionHeader title="Who" />
        <select className="add-field" value={form.employee} onChange={e => set('employee', e.target.value)}>
          <option value="">Choose someone…</option>
          {staff.map(person => (
            <option key={person.email} value={person.email}>{person.name || person.email}</option>
          ))}
        </select>
      </MobileCard>

      <MobileCard style={{ marginTop: 14 }}>
        <SectionHeader title="When" />
        <input className="add-field" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        <div className="add-row">
          <label>
            <span>Start</span>
            <input className="add-field" type="time" value={form.start} onChange={e => set('start', e.target.value)} />
          </label>
          <label>
            <span>End</span>
            <input className="add-field" type="time" value={form.end} onChange={e => set('end', e.target.value)} />
          </label>
        </div>
        <label className="add-inline">
          <span>Unpaid break</span>
          <input
            className="add-field add-small"
            type="number"
            min="0"
            step="5"
            value={form.breakMinutes}
            onChange={e => set('breakMinutes', e.target.value)}
          />
          <span className="add-suffix">min</span>
        </label>
        <p className="add-note">{hours.toFixed(hours % 1 === 0 ? 0 : 2)} hours paid</p>
      </MobileCard>

      <MobileCard style={{ marginTop: 14 }}>
        <SectionHeader title="Role" />
        {roles.length > 0 && (
          <div className="add-roles">
            {roles.map(role => (
              <button
                key={role}
                className={form.role === role ? 'on' : ''}
                onClick={() => set('role', form.role === role ? '' : role)}
              >{role}</button>
            ))}
          </div>
        )}
        <input
          className="add-field"
          placeholder="Or type a role"
          value={form.role}
          onChange={e => set('role', e.target.value)}
        />
        <input
          className="add-field"
          placeholder="Note for them (optional)"
          value={form.note}
          onChange={e => set('note', e.target.value)}
        />
      </MobileCard>

      <label className="add-publish">
        <input type="checkbox" checked={form.publish} onChange={e => set('publish', e.target.checked)} />
        <span>
          <strong>Publish it</strong>
          <small>They are told straight away. Leave off to save it as a draft.</small>
        </span>
      </label>

      {error && <p className="add-error">{error}</p>}

      <button className="add-save" onClick={save} disabled={!valid || saving}>
        {saving
          ? 'Saving…'
          : isEditing
            ? (form.publish ? 'Save and notify' : 'Save as draft')
            : (form.publish ? 'Add and publish' : 'Save as draft')}
      </button>

      {isEditing && (
        <button className="add-delete" onClick={remove} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete shift'}
        </button>
      )}

      <style>{`
        .add-shift { padding: 16px 16px 40px; }

        .add-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .add-head h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .add-back {
          background: none;
          border: none;
          padding: 4px;
          color: var(--mobile-text);
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .add-field {
          width: 100%;
          margin-top: 8px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-bg);
          color: var(--mobile-text);
          font-size: 15px;
          font-family: inherit;
        }

        .add-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .add-row label,
        .add-inline {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 13px;
          color: var(--mobile-text-secondary);
          margin-top: 8px;
        }

        .add-inline {
          flex-direction: row;
          align-items: center;
          gap: 10px;
        }

        .add-small { width: 96px; margin-top: 0; }
        .add-suffix { font-size: 13px; }

        .add-note {
          margin: 10px 4px 0;
          font-size: 13px;
          color: var(--mobile-text-secondary);
        }

        .add-roles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .add-roles button {
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--mobile-border);
          background: none;
          font-size: 14px;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .add-roles button.on {
          border-color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
          font-weight: 600;
        }

        .add-publish {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin: 18px 4px 0;
          font-size: 15px;
          color: var(--mobile-text);
        }

        .add-publish input { margin-top: 3px; width: 20px; height: 20px; }
        .add-publish span { display: flex; flex-direction: column; gap: 2px; }
        .add-publish small { font-size: 13px; color: var(--mobile-text-secondary); }

        .add-error {
          margin: 14px 4px 0;
          font-size: 14px;
          font-weight: 600;
          color: #c0392b;
        }

        .add-save {
          width: 100%;
          margin-top: 18px;
          padding: 15px;
          border: none;
          border-radius: 12px;
          background: var(--mobile-accent);
          color: var(--mobile-on-accent);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }

        .add-save:disabled { opacity: 0.45; cursor: default; }

        .add-delete {
          width: 100%;
          margin-top: 10px;
          padding: 14px;
          border: 1px solid rgba(192, 57, 43, 0.35);
          border-radius: 12px;
          background: none;
          color: #c0392b;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }

        .add-delete:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  )
}
