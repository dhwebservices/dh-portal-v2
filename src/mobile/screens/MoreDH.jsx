/**
 * More tab: everything that isn't Home, Apps, Leads or Clients. Staff tools
 * (rota, leave, payroll) sit here now because the business doesn't run on
 * them day to day; they're one tap away when it does.
 */
import { isDirectorEmail } from '../../utils/orgStructure'
import { Section, Row, PageTitle, DHStyles } from '../components/DH'

export default function MoreDH({ navigate, user, isAdmin, can }) {
  const initials = (user?.name || 'DH').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
  const phone = isAdmin || can?.('app_phone')
  return (
    <div className="dh-page">
      <DHStyles />
      <PageTitle title="More" />
      <div className="dh-card">
        <Row avatar={{ text: initials, color: '#0B5FD0' }} title={user?.name || 'My profile'} sub="My profile" onPress={() => navigate('profile')} />
      </div>
      <Section label="Business">
        {phone && <Row icon="smartphone" title="Phone" sub="Call menu, who answers, calls, texts" onPress={() => navigate('phone')} />}
        {isAdmin && <Row icon="bell" title="Send a message" sub="Notify staff on their phones" onPress={() => navigate('send-notification')} />}
      </Section>
      <Section label="Staff">
        {isAdmin && <Row icon="users" tone="muted" title="Staff and onboarding" onPress={() => navigate('staff-directory')} />}
        <Row icon="calendar" tone="muted" title="Rota" onPress={() => navigate('rota')} />
        <Row icon="briefcase" tone="muted" title="My shifts" onPress={() => navigate('myshifts')} />
        <Row icon="clock" tone="muted" title="Clock in" onPress={() => navigate('clockin')} />
        <Row icon="plane" tone="muted" title="Leave" onPress={() => navigate('leave')} />
        <Row icon="checkCircle" tone="muted" title="Timesheets" onPress={() => navigate('timesheet')} />
        <Row icon="barChart" tone="muted" title="Attendance" onPress={() => navigate('attendance')} />
        <Row icon="file" tone="muted" title="Payslips" onPress={() => navigate('payslips')} />
      </Section>
      <Section label="Devices">
        {isDirectorEmail(user?.email) && <Row icon="lock" tone="muted" title="Device management" onPress={() => navigate('device-management')} />}
        <Row icon="barChart" tone="muted" title="Diagnostics" onPress={() => navigate('diagnostics')} />
        <Row icon="smartphone" tone="muted" title="Your devices" onPress={() => navigate('devices')} />
        <Row icon="settings" tone="muted" title="Settings" onPress={() => navigate('settings')} />
      </Section>
    </div>
  )
}
