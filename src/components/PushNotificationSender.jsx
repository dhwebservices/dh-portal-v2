import { apiUrl } from '../utils/apiBase'
import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { loadActivePortalStaffAudience } from '../utils/staffAudience'
import {
  Button,
  FormField,
  FormLabel,
  FormInput,
  FormSelect,
  FormHint,
  Alert,
} from './ds'

const ALL_RECIPIENTS = '__all__'

// Push goes out through /api/send-push-notification, which talks to APNs
// directly. Whether a device can be reached depends on APNS_ENVIRONMENT: it is
// set to "production", which covers TestFlight and App Store builds. Devices
// running a debug build signed from Xcode register sandbox tokens and will fail
// with a BadDeviceToken until that variable is switched back.
export default function PushNotificationSender() {
  const [staff, setStaff] = useState([])
  const [deviceCounts, setDeviceCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [recipient, setRecipient] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [audience, { data: devices }] = await Promise.all([
        loadActivePortalStaffAudience(),
        supabase.from('user_devices').select('user_email').eq('device_type', 'ios'),
      ])

      const counts = {}
      for (const device of devices || []) {
        const email = String(device.user_email || '').toLowerCase().trim()
        if (email) counts[email] = (counts[email] || 0) + 1
      }

      setStaff(audience)
      setDeviceCounts(counts)
    } catch (error) {
      setResult({ variant: 'error', message: `Could not load staff: ${error.message}` })
    } finally {
      setLoading(false)
    }
  }

  const withDevices = staff.filter((person) => deviceCounts[person.email] > 0)

  /**
   * One request, not one per person.
   *
   * This used to loop over the audience and fire a request each — forty staff
   * meant forty round trips from the browser, and a partial failure halfway
   * through left no way to say what had actually gone out. The endpoint now
   * takes the audience itself and answers once.
   *
   * Tagged as the `announcement` event, the same as the app's sender, so both
   * routes log identically and neither can be muted — this is the channel for
   * things staff need to know.
   */
  const send = async () => {
    if (!recipient || !title.trim() || !body.trim()) return

    setSending(true)
    setResult(null)

    const toEveryone = recipient === ALL_RECIPIENTS

    try {
      const response = await fetch(apiUrl('/api/send-push-notification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(toEveryone
            ? { userEmails: withDevices.map((p) => p.email) }
            : { userEmail: recipient }),
          event: 'announcement',
          title: title.trim(),
          body: body.trim(),
          data: { type: 'manual', sent_from: 'portal_admin' },
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setResult({ variant: 'error', message: payload.error || `Failed (${response.status})` })
        return
      }

      const sent = payload.sent || 0
      const people = payload.recipients || 0

      // A send that reached nobody says so plainly. The request succeeding is
      // not the same as somebody's phone buzzing, and conflating the two is
      // how you find out weeks later that nothing was ever delivered.
      setResult({
        variant: sent > 0 ? 'success' : 'warning',
        message: sent > 0
          ? `Delivered to ${people} ${people === 1 ? 'person' : 'people'} on ${sent} device${sent === 1 ? '' : 's'}.`
          : 'Nobody received it. Nobody in that group has the app installed with notifications turned on.',
      })

      if (sent > 0) {
        setTitle('')
        setBody('')
      }
    } catch (error) {
      setResult({ variant: 'error', message: error.message })
    } finally {
      setSending(false)
    }
  }

  const canSend = !!recipient && title.trim() && body.trim() && !sending

  return (
    <div style={{
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--border-radius-lg)',
      padding: 'var(--space-xl)',
      marginBottom: 'var(--space-xl)',
    }}>
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={{
          fontSize: 'var(--font-size-h2)',
          fontWeight: 'var(--font-weight-semibold)',
          marginBottom: '4px',
        }}>
          Send Push Notification
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Sends straight to the iOS app. Useful for checking push is alive on a TestFlight
          or App Store build without waiting for a real event.
        </p>
      </div>

      {loading ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Loading staff...</p>
      ) : (
        <>
          <FormField>
            <FormLabel>Send to</FormLabel>
            <FormSelect value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              <option value="">Choose a recipient...</option>
              <option value={ALL_RECIPIENTS}>
                Everyone with a registered device ({withDevices.length})
              </option>
              {staff.map((person) => (
                <option key={person.email} value={person.email}>
                  {person.name}
                  {deviceCounts[person.email]
                    ? ` (${deviceCounts[person.email]} device${deviceCounts[person.email] === 1 ? '' : 's'})`
                    : ' - no device'}
                </option>
              ))}
            </FormSelect>
            <FormHint>
              Only devices that have opened the iOS app and accepted notifications appear here.
            </FormHint>
          </FormField>

          <FormField>
            <FormLabel>Title</FormLabel>
            <FormInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Test notification"
              maxLength={100}
            />
          </FormField>

          <FormField>
            <FormLabel>Message</FormLabel>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. If you can see this, push notifications are working."
              rows={3}
              maxLength={300}
              style={{
                width: '100%',
                padding: 'var(--space-md)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius-md)',
                fontFamily: 'inherit',
                fontSize: '14px',
                resize: 'vertical',
              }}
            />
          </FormField>

          {result && (
            <Alert variant={result.variant} style={{ marginBottom: 'var(--space-md)' }}>
              {result.message}
            </Alert>
          )}

          <Button variant="primary" onClick={send} disabled={!canSend}>
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </>
      )}
    </div>
  )
}
