import { authHeaders } from '../../utils/authHeaders'
import { apiUrl } from '../../utils/apiBase'
import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { loadActivePortalStaffAudience } from '../../utils/staffAudience'
import Icon from '../components/Icon'
import { Screen, Sec, Field, Toggle, Seg, Btn, Note, Empty } from '../components/UI'

/**
 * Sending a message to staff phones, from a phone.
 *
 * Goes out as the `announcement` event, which is deliberately the one type
 * nobody can switch off — this is the channel for "the office is shut" and
 * "your shift has moved", and an announcement half the team has muted is not
 * a channel worth having. Ordinary event notifications all respect their
 * preference; this one does not, and the screen says so.
 *
 * Managers only. `MobileApp` gates the route on `isAdmin`, and the screen
 * refuses to render for anyone else rather than trusting the caller.
 */
export default function MobileSendNotification({ goBack, user, isAdmin }) {
  const [audience, setAudience] = useState('everyone') // 'everyone' | 'some'
  const [staff, setStaff] = useState([])
  const [chosen, setChosen] = useState(new Set())
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isAdmin) loadStaff()
  }, [isAdmin])

  /**
   * Who can actually be messaged.
   *
   * This read the `staff` table directly, which is the wrong list: it includes
   * people who have left, and misses anyone who has a portal account without a
   * `staff` row — which is why Jack, with the app installed and signed in, did
   * not appear while terminated staff did.
   *
   * `loadActivePortalStaffAudience` is the same helper the web sender uses. It
   * joins hr_profiles to user_permissions and the lifecycle settings, and
   * drops leavers and system accounts. One definition of "current staff",
   * shared by both senders.
   */
  const loadStaff = async () => {
    try {
      const audience = await loadActivePortalStaffAudience()
      setStaff(audience.filter(person => person.email))
    } catch (error) {
      console.error('Could not load staff:', error)
      setStaff([])
    }
  }

  if (!isAdmin) {
    return (
      <Screen title="Send a message" onBack={goBack}>
        <Empty icon="lock" title="This is only available to managers." />
      </Screen>
    )
  }

  const toggle = (email) => {
    setChosen(previous => {
      const next = new Set(previous)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  const canSend = title.trim().length > 0 &&
    message.trim().length > 0 &&
    (audience === 'everyone' || chosen.size > 0)

  const send = async () => {
    if (!canSend || sending) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setSending(true)
    setResult(null)

    // One request per person, using the single-recipient shape.
    //
    // The API also understands an audience in one call, but that version is
    // not deployed — the live endpoint still answers
    // "Missing required fields: userEmail" to a group send. Looping is what
    // works against what is actually running, and it keeps working unchanged
    // when the newer endpoint does go out, because `userEmail` stays
    // supported there.
    const targets = audience === 'everyone'
      ? staff.map(person => person.email)
      : [...chosen]

    let devices = 0
    let reached = 0
    const failures = []

    for (const email of targets) {
      try {
        const response = await fetch(apiUrl('/api/send-push-notification'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({
            userEmail: email,
            title: title.trim(),
            body: message.trim(),
            data: { type: 'announcement', link: '/notifications', sent_by: user?.email || '' },
          }),
        })

        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          failures.push(`${email}: ${payload.error || response.status}`)
          continue
        }
        if (payload.sent > 0) {
          devices += payload.sent
          reached += 1
        }
      } catch (error) {
        failures.push(`${email}: ${error.message}`)
      }
    }

    setSending(false)

    // Reported honestly, including why. "Nobody received it" with no reason
    // is what sent me looking in the wrong place for an hour.
    if (devices > 0) {
      setResult({
        ok: true,
        text: `Delivered to ${reached} ${reached === 1 ? 'person' : 'people'} on ${devices} device${devices === 1 ? '' : 's'}.`
          + (failures.length ? ` ${failures.length} failed.` : ''),
      })
      setTitle('')
      setMessage('')
      setChosen(new Set())
      return
    }

    setResult({
      ok: false,
      text: failures.length
        ? `Nothing sent. ${failures[0]}`
        : 'Nothing sent — nobody in that group has a registered device.',
    })
  }

  const initials = (p) => (p.name || p.email || '?').split(/[ @.]/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Screen title="Send a message" onBack={goBack}>
      <Sec>Who gets it</Sec>
      <Seg value={audience} onChange={setAudience} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'some', label: 'Choose people' }]} />

      {audience === 'some' && (
        staff.length === 0 ? <Note>No staff found.</Note> : (
          <div className="dh-card">
            {staff.map((person, i) => (
              <div key={person.email} className="dh-row">
                <span className="dh-av round" style={i % 2 ? { background: '#FFE6CC', color: '#8A4A00' } : undefined}>{initials(person)}</span>
                <span className="dh-g"><span className="dh-t">{person.name || person.email}</span></span>
                <Toggle on={chosen.has(person.email)} onChange={() => toggle(person.email)} label={person.name || person.email} />
              </div>
            ))}
          </div>
        )
      )}

      <Sec>Message</Sec>
      <div className="dh-card">
        <Field label="Title" htmlFor="msg-title">
          <input id="msg-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={60} />
        </Field>
        <Field label="Message" htmlFor="msg-body">
          <textarea id="msg-body" value={message} onChange={e => setMessage(e.target.value)} placeholder="What do you want to tell them?" rows={5} maxLength={300} />
        </Field>
      </div>
      <span className="dh-sub">
        It arrives as a notification on their phone straight away. It goes out as an
        announcement, which staff cannot mute, so use it for things they need to know.
      </span>

      {result && <Note tone={result.ok ? 'ok' : 'error'}>{result.text}</Note>}

      <Btn onPress={send} disabled={!canSend || sending}>{sending ? 'Sending…' : 'Send'}</Btn>
    </Screen>
  )
}
