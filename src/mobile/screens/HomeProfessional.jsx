import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import InfoRow from '../components/InfoRow'
import SectionHeader from '../components/SectionHeader'

/**
 * The first thing anyone sees.
 *
 * **It is not the same screen for everyone.** A manager gets the state of the
 * team — who is off, who is in, what is waiting on them, what the day costs. A
 * shift worker gets their own day. The split is `isAdmin`, which `MobileApp`
 * already derives from `user_permissions`; there is no new permission concept
 * here, and a non-manager does not render the management sections at all
 * rather than rendering them empty.
 *
 * Every figure on this screen comes from a table that already exists. Nothing
 * here needed a schema change.
 */
export default function MobileHomeProfessional({ navigate, user, isAdmin }) {
  const [myShift, setMyShift] = useState(null)
  const [onLeave, setOnLeave] = useState([])
  const [whosIn, setWhosIn] = useState({ in: 0, late: 0, notOut: 0 })
  const [pending, setPending] = useState(0)
  const [costs, setCosts] = useState([])
  const [costsOpen, setCostsOpen] = useState(true)
  const [myPay, setMyPay] = useState(null)
  const [fabOpen, setFabOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)

  useEffect(() => {
    load()
    // Intentionally once per mount: this is a glance screen, and a dashboard
    // that reshuffles while you are reading it is worse than a stale one.
  }, [])

  const load = async () => {
    try {
      await Promise.all([
        loadMyShift(),
        isAdmin ? loadTeam() : Promise.resolve(),
      ])
    } catch (error) {
      console.error('Dashboard failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMyShift = async () => {
    const { data } = await supabase
      .from('shifts')
      .select('start_time, end_time, role, break_minutes')
      .eq('employee_email', user.email)
      .eq('shift_date', iso(today))
      .eq('published', true)
      .order('start_time')
      .limit(1)

    setMyShift(data?.[0] ?? null)
    await loadMyPay()
  }

  /**
   * What my own rota is estimated to pay — today and across this week.
   *
   * An estimate, and labelled as one: it prices scheduled hours at my rate.
   * Actual pay comes from clock-ins and payroll, so the wording must never
   * imply this is what will land in someone's account.
   */
  const loadMyPay = async () => {
    const monday = new Date(today)
    const offset = (monday.getDay() + 6) % 7
    monday.setDate(monday.getDate() - offset)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)

    const [{ data: mine }, { data: me }] = await Promise.all([
      supabase
        .from('shifts')
        .select('shift_date, start_time, end_time, break_minutes')
        .eq('employee_email', user.email)
        .eq('published', true)
        .gte('shift_date', iso(monday))
        .lte('shift_date', iso(sunday)),
      supabase.from('staff').select('hourly_rate').eq('email', user.email).maybeSingle(),
    ])

    const rate = Number(me?.hourly_rate) || 0
    const minutes = (t) => {
      const [h, m] = String(t ?? '').split(':').map(Number)
      return Number.isFinite(h) ? h * 60 + (m || 0) : null
    }
    const hoursOf = (s) => {
      const from = minutes(s.start_time)
      const to = minutes(s.end_time)
      if (from === null || to === null) return 0
      return Math.max(0, to - from - (s.break_minutes || 0)) / 60
    }

    const rows = mine ?? []
    const todayHours = rows.filter(s => s.shift_date === iso(today)).reduce((t, s) => t + hoursOf(s), 0)
    const weekHours = rows.reduce((t, s) => t + hoursOf(s), 0)

    setMyPay({ rate, todayHours, weekHours, today: todayHours * rate, week: weekHours * rate })
  }

  const loadTeam = async () => {
    const todayISO = iso(today)

    // Who is off. An approved request that spans today, not one that starts
    // today — somebody in the middle of a fortnight off is still off.
    //
    // Reads `hr_leave`, which is the table the Leave screen and the approval
    // flow both use. This asked `leave_requests` — a different, near-identical
    // table that the app does not write. The dashboard reported "1 pending
    // request" from a stray row there while the Leave screen correctly showed
    // none, and clearing it changed nothing because they were never the same
    // list. Note the column is `leave_type` here, not `type`.
    const { data: leave } = await supabase
      .from('hr_leave')
      .select('user_name, leave_type')
      .eq('status', 'approved')
      .lte('start_date', todayISO)
      .gte('end_date', todayISO)

    setOnLeave(leave ?? [])

    // Waiting on a manager.
    const { count } = await supabase
      .from('hr_leave')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    setPending(count ?? 0)

    // Who is in. Today's published shifts, matched against today's clock-ins.
    const { data: shiftsToday } = await supabase
      .from('shifts')
      .select('employee_email, start_time, end_time')
      .eq('shift_date', todayISO)
      .eq('published', true)

    const start = new Date(todayISO)
    const { data: stamps } = await supabase
      .from('timesheets')
      .select('user_email, clock_in, clock_out')
      .gte('clock_in', start.toISOString())

    const clockedIn = new Set(
      (stamps ?? []).filter(s => s.clock_in && !s.clock_out).map(s => s.user_email)
    )
    const everClocked = new Set((stamps ?? []).map(s => s.user_email))

    const now = today.getHours() * 60 + today.getMinutes()
    const minutes = (t) => {
      const [h, m] = String(t ?? '').split(':').map(Number)
      return Number.isFinite(h) ? h * 60 + (m || 0) : null
    }

    let late = 0
    let notOut = 0
    for (const shift of shiftsToday ?? []) {
      const startsAt = minutes(shift.start_time)
      const endsAt = minutes(shift.end_time)
      // Late: their shift has started and they have not clocked in at all.
      if (startsAt !== null && now > startsAt && !everClocked.has(shift.employee_email)) late++
      // Still on the clock after their shift should have ended.
      if (endsAt !== null && now > endsAt && clockedIn.has(shift.employee_email)) notOut++
    }

    setWhosIn({ in: clockedIn.size, late, notOut })

    // What the next three days cost. Hours on each shift, priced at that
    // person's rate from `staff`.
    const days = [0, 1, 2].map(offset => {
      const d = new Date(today)
      d.setDate(d.getDate() + offset)
      return d
    })

    const { data: upcoming } = await supabase
      .from('shifts')
      .select('employee_email, shift_date, start_time, end_time, break_minutes')
      .in('shift_date', days.map(iso))

    const { data: rates } = await supabase.from('staff').select('email, hourly_rate')
    const rateFor = new Map((rates ?? []).map(r => [r.email, Number(r.hourly_rate) || 0]))

    setCosts(days.map((d, index) => {
      const total = (upcoming ?? [])
        .filter(s => s.shift_date === iso(d))
        .reduce((sum, s) => {
          const from = minutes(s.start_time)
          const to = minutes(s.end_time)
          if (from === null || to === null) return sum
          const worked = Math.max(0, to - from - (s.break_minutes || 0)) / 60
          return sum + worked * (rateFor.get(s.employee_email) ?? 0)
        }, 0)

      return {
        label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : 'Next day',
        date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
        iso: iso(d),
        total,
      }
    }))
  }

  const greeting = (() => {
    const hour = today.getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const firstName = (user?.name || user?.email || '').split(' ')[0].toLowerCase()

  const go = async (screen) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    navigate(screen)
  }

  const money = (n) => `£${n.toFixed(2)}`

  const leaveSummary = onLeave.length === 0
    ? 'No one is on leave today'
    : onLeave.length === 1
      ? `${onLeave[0].user_name} is on leave today`
      : `${onLeave.length} people are on leave today`

  const whosInSummary = [
    `${whosIn.in} clocked in`,
    whosIn.late > 0 && `${whosIn.late} running late`,
    whosIn.notOut > 0 && `${whosIn.notOut} not clocked out`,
  ].filter(Boolean).join(', ')

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-top">
          <img src="/dhlogo.png" alt="DH Website Services" className="dash-logo" />
          <div className="dash-header-actions">
            <button
              type="button"
              className="dash-icon-btn"
              onClick={() => go('notifications')}
              aria-label="Notifications"
            >
              <Icon name="bell" size={20} color="#ffffff" />
            </button>
            <button
              type="button"
              className="dash-icon-btn"
              onClick={() => go('settings')}
              aria-label="Settings and profile"
            >
              <Icon name="menu" size={22} color="#ffffff" />
            </button>
          </div>
        </div>

        <p className="dash-date">
          {today.toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          })}
        </p>
        <h1 className="dash-greeting">{greeting}, {firstName}</h1>
      </header>

      {/* Lifted over the header, the way the shift card is in RotaCloud —
          it is the one thing on this screen that is about you. */}
      <div className="dash-lift">
        <InfoRow
          icon={myShift ? 'clock' : 'calendar-off'}
          tone={myShift ? 'accent' : 'neutral'}
          title={myShift
            ? `${myShift.start_time} – ${myShift.end_time}`
            : 'You have no upcoming shifts today'}
          subtitle={myShift ? (myShift.role || 'Shift') : undefined}
          onPress={() => navigate('rota')}
        />
      </div>

      <div className="dash-body">
        {myPay && myPay.weekHours > 0 && (
          <section>
            <SectionHeader title="Your pay" />
            <div className="dash-stack">
              <InfoRow
                icon="pound"
                tone="accent"
                title={myPay.rate > 0
                  ? `£${myPay.today.toFixed(2)} today`
                  : `${myPay.todayHours.toFixed(1)}h today`}
                subtitle={myPay.rate > 0
                  ? `£${myPay.week.toFixed(2)} this week · estimated from your rota`
                  : 'No hourly rate set on your profile yet'}
                onPress={() => navigate('myshifts')}
              />
            </div>
          </section>
        )}

        {isAdmin && (
          <section>
            <SectionHeader title="What's happening today" />
            <div className="dash-stack">
              <InfoRow
                icon="plane"
                title={leaveSummary}
                onPress={() => navigate('leave')}
              />
              <InfoRow
                icon="briefcase"
                title="Who's in"
                subtitle={loading ? 'Checking…' : whosInSummary}
                tone={whosIn.late > 0 ? 'warn' : 'neutral'}
                onPress={() => navigate('attendance')}
              />
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="At a glance" />
          <div className="dash-stack">
            {isAdmin && (
              <InfoRow
                icon="bell"
                title={`${pending} pending request${pending === 1 ? '' : 's'}`}
                subtitle="requiring your attention"
                tone={pending > 0 ? 'warn' : 'neutral'}
                onPress={() => navigate('leave')}
              />
            )}

            {isAdmin && (
              <InfoRow
                icon="pound"
                title="Costs summary"
                subtitle="The next three days"
                onPress={() => setCostsOpen(open => !open)}
              >
                {costsOpen && (
                  <div className="dash-costs">
                    {costs.map(day => (
                      <button
                        type="button"
                        key={day.iso}
                        className="dash-cost"
                        onClick={() => navigate('rota', { date: day.iso })}
                      >
                        <span className="dash-cost-when">
                          <strong>{day.label}</strong>
                          <small>{day.date}</small>
                        </span>
                        <span className="dash-cost-total">{money(day.total)}</span>
                        <Icon name="chevron-right" size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </InfoRow>
            )}

            <InfoRow
              icon="clock"
              title="Clock in"
              subtitle="Start or end your shift"
              tone="accent"
              onPress={() => navigate('clockin')}
            />

            <InfoRow
              icon="user"
              title="Your profile"
              subtitle="Details, documents and payslips"
              onPress={() => navigate('profile')}
            />

            <InfoRow
              icon="plane"
              title="Book time off"
              subtitle="Request holiday or report sickness"
              onPress={() => navigate('leave')}
            />

            {isAdmin && (
              <InfoRow
                icon="users"
                title="Staff"
                subtitle="Profiles, permissions and onboarding"
                onPress={() => navigate('staff-directory')}
              />
            )}

            {isAdmin && (
              <InfoRow
                icon="briefcase"
                title="Clients contacted"
                subtitle="The outreach log"
                onPress={() => navigate('outreach')}
              />
            )}
          </div>
        </section>
      </div>

      {/* The quick-add menu.
          Every item here goes somewhere that exists. There is deliberately no
          "Add accrued TOIL" — nothing in this system records TOIL, and a menu
          item that opens nothing is worse than an absent one. */}
      {fabOpen && (
        <>
          <div className="dash-scrim" onClick={() => setFabOpen(false)} />
          <div className="dash-menu-sheet" role="menu">
            {(isAdmin ? [
              { icon: 'grid', label: 'Add shift', to: 'add-shift' },
              { icon: 'plane', label: 'Add leave', to: 'leave' },
              { icon: 'clock', label: 'Clock in', to: 'clockin' },
              { icon: 'users', label: 'Staff', to: 'staff-directory' },
              { icon: 'user', label: 'Add employee', to: 'add-staff' },
              { icon: 'check', label: 'Onboarding', to: 'onboarding-review' },
              { icon: 'briefcase', label: 'Clients contacted', to: 'outreach' },
              { icon: 'bell', label: 'Send a message', to: 'send-notification' },
            ] : [
              { icon: 'clock', label: 'Clock in', to: 'clockin' },
              { icon: 'plane', label: 'Book time off', to: 'leave' },
            ]).map(item => (
              <button
                key={item.to}
                type="button"
                className="dash-menu-item"
                onClick={() => { setFabOpen(false); navigate(item.to) }}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        className={`dash-fab${fabOpen ? ' open' : ''}`}
        onClick={async () => {
          await Haptics.impact({ style: ImpactStyle.Light })
          setFabOpen(open => !open)
        }}
        aria-label={fabOpen ? 'Close menu' : 'Add'}
        aria-expanded={fabOpen}
      >
        <Icon name={fabOpen ? 'x' : 'plus'} size={26} color="var(--mobile-on-accent)" />
      </button>

      <style>{`
        .dash {
          position: relative;
          min-height: 100%;
          padding-bottom: 90px;
        }

        .dash-header {
          background: var(--mobile-accent);
          color: #ffffff;
          padding: 18px 20px 58px;
        }

        .dash-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        /* The logo carries white text and a transparent ground, so it sits on
           the blue without a plate behind it. */
        .dash-logo {
          height: 26px;
          width: auto;
          display: block;
        }

        .dash-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dash-icon-btn {
          background: rgba(255, 255, 255, 0.16);
          border: none;
          border-radius: 10px;
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .dash-date {
          margin: 0 0 2px;
          font-size: 14px;
          opacity: 0.85;
        }

        .dash-greeting {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.15;
          text-transform: capitalize;
        }

        /* Pulls the card up over the header's lower edge. */
        .dash-lift {
          margin: -42px 16px 0;
          position: relative;
          z-index: 1;
        }

        .dash-body {
          display: flex;
          flex-direction: column;
          gap: 26px;
          padding: 26px 16px 0;
        }

        .dash-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .dash-costs {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--mobile-border);
        }

        .dash-cost {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 13px 0;
          background: none;
          border: none;
          border-bottom: 1px solid var(--mobile-border);
          color: var(--mobile-text);
          cursor: pointer;
          text-align: left;
        }

        .dash-cost:last-child { border-bottom: none; }

        .dash-cost-when {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .dash-cost-when strong {
          font-size: 15px;
          font-weight: 600;
        }

        .dash-cost-when small {
          font-size: 12.5px;
          color: var(--mobile-text-secondary);
        }

        .dash-cost-total {
          font-size: 16px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .dash-cost svg { color: var(--mobile-text-secondary); opacity: 0.5; }

        .dash-scrim {
          position: fixed;
          inset: 0;
          background: rgba(10, 20, 30, 0.28);
          z-index: 4;
        }

        .dash-menu-sheet {
          position: fixed;
          right: 18px;
          bottom: 152px;
          min-width: 216px;
          background: var(--mobile-card);
          border-radius: 14px;
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.22);
          overflow: hidden;
          z-index: 6;
          display: flex;
          flex-direction: column;
        }

        .dash-menu-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px 18px;
          background: none;
          border: none;
          border-bottom: 1px solid var(--mobile-border);
          font-size: 16px;
          color: var(--mobile-text);
          cursor: pointer;
          text-align: left;
        }

        .dash-menu-item:last-child { border-bottom: none; }
        .dash-menu-item svg { color: var(--mobile-text-secondary); }
        .dash-menu-item:active { background: var(--mobile-accent-soft); }

        .dash-fab.open { background: var(--mobile-accent-strong); }

        .dash-fab {
          position: fixed;
          right: 18px;
          bottom: 86px;
          width: 58px;
          height: 58px;
          border-radius: 50%;
          border: none;
          background: var(--mobile-accent);
          box-shadow: 0 6px 18px rgba(0, 82, 163, 0.38);
          display: grid;
          place-items: center;
          cursor: pointer;
          z-index: 5;
        }

        .dash-fab:active { transform: scale(0.96); }

        @media (prefers-reduced-motion: reduce) {
          .dash-fab:active, .info-row-pressable:active { transform: none; }
        }
      `}</style>
    </div>
  )
}
