/**
 * Apps tab: every DH app in one list, grouped by where it is. Each row opens
 * that app's existing admin screen. Statuses are as of 25 Nov 2026; they are
 * written here rather than fetched because no store API is wired to the app.
 */
import { PageTitle, Section, Row, Chip, DHStyles } from '../components/DH'

export default function AppsHub({ navigate, isAdmin, can }) {
  const fish = isAdmin || can?.('app_fishtank')
  const phone = isAdmin || can?.('app_phone')
  return (
    <div className="dh-page">
      <DHStyles />
      <PageTitle title="Apps" />
      <Section label="In the stores">
        {fish && <Row avatar={{ text: 'FT', color: '#0E7490' }} title="Fish Tank" sub="iPhone and Android · players, coins, prizes" right={<Chip tone="green">Live</Chip>} onPress={() => navigate('fishtank')} />}
        {isAdmin && <Row avatar={{ text: 'BP', color: '#4338CA' }} title="Bill Pal" sub="Bills, members, chat, suppliers · work paused" right={<Chip tone="green">Live</Chip>} onPress={() => navigate('billpal')} />}
        {isAdmin && <Row avatar={{ text: 'FH', color: '#BE185D' }} title="Fam & a Half" sub="Users, circles, messages · work paused" right={<Chip tone="green">Live</Chip>} onPress={() => navigate('findmygang')} />}
        <Row avatar={{ text: 'CF', color: '#7F1D1D' }} title="CrossWord: Criminal Files" sub="iPhone" right={<Chip tone="amber">With Apple</Chip>} />
      </Section>
      <Section label="Business">
        {phone && <Row avatar={{ text: 'DP', color: '#0E1726' }} title="Phone system" sub="Who answers, call menu, calls and texts" onPress={() => navigate('phone')} />}
        {isAdmin && <Row icon="bell" title="Send a message" sub="Notify staff on their phones" onPress={() => navigate('send-notification')} />}
      </Section>
      <Section label="Testing">
        <Row avatar={{ text: 'DH', color: '#0B5FD0' }} title="DH Staff Portal" sub="This app" right={<Chip tone="blue">TestFlight</Chip>} />
        <Row avatar={{ text: 'H', color: '#312E81' }} title="Hush" right={<Chip tone="blue">TestFlight</Chip>} />
      </Section>
    </div>
  )
}
