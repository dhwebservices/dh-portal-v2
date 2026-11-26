import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { loadActivePortalStaffAudience } from '../../utils/staffAudience'
import { Screen, Sec, Field, ToggleRow, Pills, Pill, Btn, Note } from '../components/UI'

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
    <Screen title={isEditing ? 'Edit shift' : 'Add shift'} onBack={goBack}>
      <Sec>Who</Sec>
      {staff.length > 0 && staff.length <= 6 ? (
        <Pills>
          {staff.map(person => (
            <Pill key={person.email} on={form.employee === person.email} onPress={() => set('employee', form.employee === person.email ? '' : person.email)}>
              {person.name || person.email}
            </Pill>
          ))}
        </Pills>
      ) : (
        <div className="dh-card">
          <Field label="Staff member" htmlFor="as-who">
            <select id="as-who" value={form.employee} onChange={e => set('employee', e.target.value)}>
              <option value="">Choose someone…</option>
              {staff.map(person => (
                <option key={person.email} value={person.email}>{person.name || person.email}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Sec>When</Sec>
      <div className="dh-card">
        <Field label="Date" htmlFor="as-date">
          <input id="as-date" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </Field>
        <div className="as-two">
          <Field label="Start" htmlFor="as-start">
            <input id="as-start" type="time" value={form.start} onChange={e => set('start', e.target.value)} />
          </Field>
          <Field label="Finish" htmlFor="as-end">
            <input id="as-end" type="time" value={form.end} onChange={e => set('end', e.target.value)} />
          </Field>
        </div>
        <Field label="Unpaid break (minutes)" htmlFor="as-break" hint={`${hours.toFixed(hours % 1 === 0 ? 0 : 2)} hours paid`}>
          <input id="as-break" type="number" min="0" step="5" inputMode="numeric" value={form.breakMinutes} onChange={e => set('breakMinutes', e.target.value)} />
        </Field>
      </div>

      <Sec>Role</Sec>
      {roles.length > 0 && (
        <Pills>
          {roles.map(role => (
            <Pill key={role} on={form.role === role} onPress={() => set('role', form.role === role ? '' : role)}>{role}</Pill>
          ))}
        </Pills>
      )}
      <div className="dh-card">
        <Field label="Role" htmlFor="as-role">
          <input id="as-role" placeholder="Or type a role" value={form.role} onChange={e => set('role', e.target.value)} />
        </Field>
        <Field label="Note for them" htmlFor="as-note">
          <input id="as-note" placeholder="Optional" value={form.note} onChange={e => set('note', e.target.value)} />
        </Field>
        <ToggleRow title="Publish it" sub="They're told straight away. Off saves a draft." on={!!form.publish} onChange={(v) => set('publish', v)} />
      </div>

      <Note tone="error">{error}</Note>

      <Btn onPress={save} disabled={!valid || saving}>
        {saving
          ? 'Saving…'
          : isEditing
            ? (form.publish ? 'Save and notify' : 'Save as draft')
            : (form.publish ? 'Add and publish' : 'Save as draft')}
      </Btn>

      {isEditing && (
        <Btn variant="danger" onPress={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete shift'}</Btn>
      )}

      <style>{`
        .as-two { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--mobile-border); }
        .as-two .dh-fld { border-bottom: 0; }
        .as-two .dh-fld + .dh-fld { border-left: 1px solid var(--mobile-border); }
      `}</style>
    </Screen>
  )
}
