import { apiUrl } from '../../utils/apiBase'
import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { loadActivePortalStaffAudience } from '../../utils/staffAudience'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import SectionHeader from '../components/SectionHeader'

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
      <div className="send-screen">
        <p className="send-note">This is only available to managers.</p>
      </div>
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
          headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="send-screen">
      <div className="send-head">
        <button className="send-back" onClick={goBack} aria-label="Back">
          <Icon name="chevron-left" size={20} />
        </button>
        <h1>Send a message</h1>
      </div>

      <MobileCard>
        <SectionHeader title="Who gets it" />
        <div className="send-audience">
          <button
            className={audience === 'everyone' ? 'active' : ''}
            onClick={() => setAudience('everyone')}
          >Everyone</button>
          <button
            className={audience === 'some' ? 'active' : ''}
            onClick={() => setAudience('some')}
          >Choose people</button>
        </div>

        {audience === 'some' && (
          <div className="send-people">
            {staff.map(person => {
              const on = chosen.has(person.email)
              return (
                <button
                  key={person.email}
                  className={`send-person${on ? ' on' : ''}`}
                  onClick={() => toggle(person.email)}
                >
                  <span>{person.name || person.email}</span>
                  {on && <Icon name="check" size={16} />}
                </button>
              )
            })}
            {staff.length === 0 && <p className="send-note">No staff found.</p>}
          </div>
        )}
      </MobileCard>

      <MobileCard style={{ marginTop: 16 }}>
        <SectionHeader title="Message" />
        <input
          className="send-field"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={60}
        />
        <textarea
          className="send-field send-textarea"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="What do you want to tell them?"
          rows={4}
          maxLength={300}
        />
        <p className="send-note">
          This goes out as an announcement, which staff cannot mute. Use it for
          things they need to know, not for things that can wait.
        </p>
      </MobileCard>

      {result && (
        <p className={`send-result ${result.ok ? 'ok' : 'bad'}`}>{result.text}</p>
      )}

      <button className="send-button" onClick={send} disabled={!canSend || sending}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      <style>{`
        .send-screen {
          padding: 16px 16px 40px;
        }

        .send-head {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .send-head h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: var(--mobile-text);
        }

        .send-back {
          background: none;
          border: none;
          padding: 4px;
          color: var(--mobile-text);
          cursor: pointer;
          display: grid;
          place-items: center;
        }

        .send-audience {
          display: flex;
          gap: 8px;
          padding: 0 4px 4px;
        }

        .send-audience button {
          flex: 1;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: none;
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
        }

        .send-audience button.active {
          background: var(--mobile-accent);
          border-color: var(--mobile-accent);
          color: var(--mobile-on-accent);
        }

        .send-people {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 12px;
          max-height: 260px;
          overflow-y: auto;
        }

        .send-person {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: none;
          font-size: 15px;
          color: var(--mobile-text);
          cursor: pointer;
          text-align: left;
        }

        .send-person.on {
          border-color: var(--mobile-accent);
          background: var(--mobile-accent-soft);
          color: var(--mobile-accent);
        }

        .send-field {
          width: 100%;
          margin-top: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-bg);
          color: var(--mobile-text);
          font-size: 15px;
          font-family: inherit;
        }

        .send-textarea { resize: vertical; }

        .send-note {
          margin: 10px 4px 0;
          font-size: 13px;
          line-height: 1.45;
          color: var(--mobile-text-secondary);
        }

        .send-result {
          margin: 16px 4px 0;
          font-size: 14px;
          font-weight: 600;
        }

        .send-result.ok { color: #1f7a4d; }
        .send-result.bad { color: #c0392b; }

        .send-button {
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

        .send-button:disabled {
          opacity: 0.45;
          cursor: default;
        }
      `}</style>
    </div>
  )
}
