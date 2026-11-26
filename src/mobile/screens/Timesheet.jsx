import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import { Screen, KV, Field, Btn } from '../components/UI'

export default function MobileTimesheet({ goBack, user }) {
  const [currentWeek, setCurrentWeek] = useState(0) // 0 = this week, 1-3 = next weeks
  const [schedule, setSchedule] = useState({}) // { 'YYYY-MM-DD': { hours: 8, notes: '' } }
  const [selectedDate, setSelectedDate] = useState(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [entryForm, setEntryForm] = useState({ hours: 8, notes: '' })

  useEffect(() => {
    loadSchedule()
  }, [user?.email])

  const loadSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('work_schedule')
        .select('*')
        .eq('user_email', user.email)
        .gte('date', getWeekStart(0).toISOString().split('T')[0])
        .lte('date', getWeekEnd(3).toISOString().split('T')[0])

      if (error) throw error

      const scheduleMap = {}
      data?.forEach(entry => {
        scheduleMap[entry.date] = {
          hours: entry.hours,
          notes: entry.notes || '',
        }
      })
      setSchedule(scheduleMap)
    } catch (error) {
      console.error('Failed to load schedule:', error)
    }
  }

  const getWeekStart = (weekOffset) => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Monday as start
    const monday = new Date(today)
    monday.setDate(today.getDate() + diff + (weekOffset * 7))
    monday.setHours(0, 0, 0, 0)
    return monday
  }

  const getWeekEnd = (weekOffset) => {
    const start = getWeekStart(weekOffset)
    const end = new Date(start)
    end.setDate(start.getDate() + 6) // Sunday
    return end
  }

  const getWeekDates = (weekOffset) => {
    const dates = []
    const start = getWeekStart(weekOffset)
    for (let i = 0; i < 7; i++) {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const formatDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDisplayDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
  }

  const handleDatePress = async (date) => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    const dateStr = formatDate(date)
    setSelectedDate(dateStr)
    setEntryForm(schedule[dateStr] || { hours: 8, notes: '' })
    setShowEntryModal(true)
  }

  const handleSaveEntry = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!selectedDate) return

    try {
      const { error } = await supabase
        .from('work_schedule')
        .upsert({
          user_email: user.email,
          user_name: user.name,
          date: selectedDate,
          hours: Number(entryForm.hours),
          notes: entryForm.notes,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_email,date'
        })

      if (error) throw error

      setSchedule({
        ...schedule,
        [selectedDate]: { hours: Number(entryForm.hours), notes: entryForm.notes }
      })
      setShowEntryModal(false)
      setSelectedDate(null)
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to save schedule:', error)
      alert('Failed to save schedule. Please try again.')
    }
  }

  const handleDeleteEntry = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!selectedDate || !confirm('Remove this scheduled work day?')) return

    try {
      const { error } = await supabase
        .from('work_schedule')
        .delete()
        .eq('user_email', user.email)
        .eq('date', selectedDate)

      if (error) throw error

      const newSchedule = { ...schedule }
      delete newSchedule[selectedDate]
      setSchedule(newSchedule)
      setShowEntryModal(false)
      setSelectedDate(null)
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      alert('Failed to delete schedule. Please try again.')
    }
  }

  const weekDates = getWeekDates(currentWeek)
  const weekStart = getWeekStart(currentWeek)
  const weekEnd = getWeekEnd(currentWeek)
  const weekLabel = `${formatDisplayDate(weekStart)} - ${formatDisplayDate(weekEnd)}`

  const totalHoursThisWeek = weekDates.reduce((sum, date) => {
    const dateStr = formatDate(date)
    return sum + (schedule[dateStr]?.hours || 0)
  }, 0)

  if (showEntryModal) {
    return (
      <Screen title="Schedule work" onBack={() => setShowEntryModal(false)}>
        <div className="dh-card">
          <KV k="Date" v={selectedDate} />
          <Field label="Hours" htmlFor="ts-hours">
            <input id="ts-hours" type="number" min="0" max="24" step="0.5" inputMode="decimal" value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="ts-note">
            <textarea id="ts-note" rows={3} value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} placeholder="Optional, e.g. working from the office" />
          </Field>
        </div>
        <Btn onPress={handleSaveEntry}>Save</Btn>
        {schedule[selectedDate] && <Btn variant="danger" onPress={handleDeleteEntry}>Remove</Btn>}
      </Screen>
    )
  }

  return (
    <Screen title="Work schedule" onBack={goBack}>
      <div className="rota-nav">
        <button
          type="button"
          className="dh-back"
          onClick={async () => {
            if (currentWeek > 0) {
              await Haptics.impact({ style: ImpactStyle.Light })
              setCurrentWeek(currentWeek - 1)
            }
          }}
          disabled={currentWeek === 0}
          aria-label="Previous week"
          style={{ opacity: currentWeek === 0 ? 0.3 : 1 }}
        ><Icon name="chevronLeft" size={22} /></button>
        <span className="dh-h2" style={{ fontSize: 17 }}>{weekLabel}</span>
        <button
          type="button"
          className="dh-back"
          onClick={async () => {
            if (currentWeek < 3) {
              await Haptics.impact({ style: ImpactStyle.Light })
              setCurrentWeek(currentWeek + 1)
            }
          }}
          disabled={currentWeek === 3}
          aria-label="Next week"
          style={{ opacity: currentWeek === 3 ? 0.3 : 1 }}
        ><Icon name="chevronRight" size={22} /></button>
      </div>

      <div className="dh-card">
        {weekDates.map(date => {
          const dateStr = formatDate(date)
          const entry = schedule[dateStr]
          const isToday = formatDate(new Date()) === dateStr
          const isPast = date < new Date() && !isToday
          const Tag = isPast ? 'div' : 'button'
          return (
            <Tag
              key={dateStr}
              type={isPast ? undefined : 'button'}
              className="dh-row"
              style={{ background: isToday ? 'var(--mobile-accent-soft)' : undefined, opacity: isPast ? 0.55 : 1 }}
              onClick={isPast ? undefined : () => handleDatePress(date)}
            >
              <span className="rota-date"><span className="dh-t">{formatDisplayDate(date).split(' ')[0]}</span><span className="dh-sub">{date.getDate()}</span></span>
              <span className="dh-g">
                {entry ? (
                  <>
                    <span className="dh-t">{entry.hours}h scheduled</span>
                    {entry.notes && <span className="dh-sub">{entry.notes}</span>}
                  </>
                ) : <span className="dh-sub">{isPast ? 'Past' : 'Tap to schedule'}</span>}
              </span>
              {!isPast && <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>}
            </Tag>
          )
        })}
      </div>

      <div className="dh-card">
        <div className="dh-row"><span className="dh-g"><span className="dh-t">Scheduled this week</span></span><span className="dh-val">{totalHoursThisWeek}h</span></div>
      </div>

      <span className="dh-sub">
        Plan your hours for the next four weeks. Actual hours come from GPS
        clock-in, not from here.
      </span>
      <style>{`
        .rota-nav { display: flex; align-items: center; justify-content: space-between; margin: -4px -12px; }
        .rota-date { width: 44px; flex: none; display: flex; flex-direction: column; gap: 2px; }
      `}</style>
    </Screen>
  )
}
