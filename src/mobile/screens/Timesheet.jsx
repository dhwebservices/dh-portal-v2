import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

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
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={() => setShowEntryModal(false)}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Schedule Work</h1>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: '20px' }}>
          <div className="form-group">
            <label className="form-label">Date</label>
            <div className="date-display">{selectedDate}</div>
          </div>

          <div className="form-group">
            <label className="form-label">Hours</label>
            <input
              type="number"
              className="form-input"
              min="0"
              max="24"
              step="0.5"
              value={entryForm.hours}
              onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-input"
              rows={3}
              value={entryForm.notes}
              onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
              placeholder="e.g., Working from office"
            />
          </div>

          <button className="btn-primary" onClick={handleSaveEntry}>
            Save Schedule
          </button>

          {schedule[selectedDate] && (
            <button className="btn-delete" onClick={handleDeleteEntry}>
              <Icon name="trash" size={18} color="#ff3b30" />
              Remove
            </button>
          )}
        </div>

        <style>{`
          .form-group {
            margin-bottom: 20px;
          }

          .form-label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 8px;
          }

          .form-input {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          .form-input:focus {
            outline: none;
            border-color: #0066cc;
          }

          .date-display {
            padding: 12px;
            background: #f5f5f7;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1a1a1a;
          }

          .btn-primary {
            width: 100%;
            padding: 14px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 12px;
          }

          .btn-primary:active {
            opacity: 0.8;
          }

          .btn-delete {
            width: 100%;
            padding: 14px;
            background: white;
            color: #ff3b30;
            border: 1px solid #ff3b30;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .btn-delete:active {
            opacity: 0.8;
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Work Schedule</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Week Navigation */}
      <div className="week-nav">
        <button
          className="week-nav-btn"
          onClick={async () => {
            if (currentWeek > 0) {
              await Haptics.impact({ style: ImpactStyle.Light })
              setCurrentWeek(currentWeek - 1)
            }
          }}
          disabled={currentWeek === 0}
        >
          <Icon name="chevronLeft" size={20} color={currentWeek === 0 ? '#d2d2d7' : '#0066cc'} />
        </button>
        <div className="week-label">{weekLabel}</div>
        <button
          className="week-nav-btn"
          onClick={async () => {
            if (currentWeek < 3) {
              await Haptics.impact({ style: ImpactStyle.Light })
              setCurrentWeek(currentWeek + 1)
            }
          }}
          disabled={currentWeek === 3}
        >
          <Icon name="chevronRight" size={20} color={currentWeek === 3 ? '#d2d2d7' : '#0066cc'} />
        </button>
      </div>

      {/* Total Hours */}
      <div style={{ padding: '0 20px 20px' }}>
        <MobileCard>
          <div className="total-hours">
            <Icon name="clock" size={24} color="#0066cc" />
            <div>
              <div className="total-hours-label">Scheduled Hours This Week</div>
              <div className="total-hours-value">{totalHoursThisWeek}h</div>
            </div>
          </div>
        </MobileCard>
      </div>

      {/* Calendar */}
      <div style={{ padding: '0 20px 100px' }}>
        <div className="calendar">
          {weekDates.map(date => {
            const dateStr = formatDate(date)
            const entry = schedule[dateStr]
            const isToday = formatDate(new Date()) === dateStr
            const isPast = date < new Date() && !isToday

            return (
              <MobileCard
                key={dateStr}
                onPress={() => !isPast && handleDatePress(date)}
                style={{ opacity: isPast ? 0.5 : 1 }}
              >
                <div className="calendar-day">
                  <div className="calendar-day-header">
                    <div className={`calendar-day-name ${isToday ? 'today' : ''}`}>
                      {formatDisplayDate(date)}
                    </div>
                    {entry && (
                      <div className="calendar-day-hours">{entry.hours}h</div>
                    )}
                  </div>
                  {entry?.notes && (
                    <div className="calendar-day-notes">{entry.notes}</div>
                  )}
                  {!entry && !isPast && (
                    <div className="calendar-day-empty">Tap to schedule</div>
                  )}
                  {isPast && !entry && (
                    <div className="calendar-day-empty">Past</div>
                  )}
                </div>
              </MobileCard>
            )
          })}
        </div>
      </div>

      <div className="info-banner">
        <Icon name="info" size={16} color="#0066cc" />
        <p>Schedule your planned work hours for the next 4 weeks. Actual hours are tracked via GPS clock-in.</p>
      </div>

      <style>{`
        .week-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: white;
          border-bottom: 1px solid #f5f5f7;
        }

        .week-nav-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: none;
          cursor: pointer;
        }

        .week-nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .week-label {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .total-hours {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 4px;
        }

        .total-hours-label {
          font-size: 13px;
          color: #86868b;
          margin-bottom: 4px;
        }

        .total-hours-value {
          font-size: 24px;
          font-weight: 700;
          color: #0066cc;
        }

        .calendar {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .calendar-day {
          padding: 4px;
        }

        .calendar-day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .calendar-day-name {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .calendar-day-name.today {
          color: #0066cc;
        }

        .calendar-day-hours {
          font-size: 18px;
          font-weight: 700;
          color: #0066cc;
        }

        .calendar-day-notes {
          font-size: 13px;
          color: #86868b;
          font-style: italic;
        }

        .calendar-day-empty {
          font-size: 13px;
          color: #a8a096;
        }

        .info-banner {
          position: fixed;
          bottom: 60px;
          left: 20px;
          right: 20px;
          background: #e3f2fd;
          border: 1px solid #0066cc;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .info-banner p {
          margin: 0;
          font-size: 12px;
          color: #0066cc;
          line-height: 1.5;
        }

        @supports (padding: max(0px)) {
          .info-banner {
            bottom: max(60px, calc(60px + env(safe-area-inset-bottom)));
          }
        }
      `}</style>
    </div>
  )
}
