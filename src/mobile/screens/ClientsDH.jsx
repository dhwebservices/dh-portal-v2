/**
 * Clients tab. One client today (The Maltsters Arms); written out rather than
 * fetched because the client list lives in the client area's own D1, which
 * the app can't read yet. Buttons open the real sites.
 */
import { Browser } from '@capacitor/browser'
import { PageTitle, Section, Row, Chip, DHStyles } from '../components/DH'

const open = (url) => Browser.open({ url }).catch(() => window.open(url, '_blank'))

export default function ClientsDH() {
  return (
    <div className="dh-page">
      <DHStyles />
      <PageTitle title="Clients" />
      <div className="dh-card">
        <div style={{ background: '#1C1917', color: '#fff', padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'Archivo, system-ui, sans-serif', fontWeight: 800, fontSize: 22 }}>The Maltsters Arms</span>
          <span style={{ fontSize: 13, color: '#C9C3BC' }}>Bridge Street, Pontypridd · Shaun, Sophie</span>
        </div>
        <Row title="Website" sub="Care plan · same-day updates" right={<Chip tone="green">Live</Chip>} />
        <Row icon="edit" title="Open their admin" sub="Post events, hours, drinks, photos" onPress={() => open('https://app.dhwebsiteservices.co.uk')} />
      </div>
      <Section label="Update requests">
        <Row icon="checkCircle" tone="muted" title="Nothing waiting" sub="Change requests from clients will land here" />
      </Section>
      <p className="dh-note">New clients appear here once they're added in the client area.</p>
    </div>
  )
}
