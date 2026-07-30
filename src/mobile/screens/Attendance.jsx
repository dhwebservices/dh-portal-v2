import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'

export default function MobileAttendance({ goBack, user, navigate }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week') // week, month, all
  const [stats, setStats] = useState({ totalHours: 0, totalDays: 0, avgHours: 0 })

  useEffect(() => {
    loadAttendance()
  }, [user?.email, period])

  const loadAttendance = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('attendance')
        .select('*')
        .eq('user_email', user.email)
        .order('date', { ascending: false })

      // Filter by period
      const now = new Date()
      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        query = query.gte('date', weekAgo.toISOString().split('T')[0])
      } else if (period === 'month') {
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        query = query.gte('date', monthAgo.toISOString().split('T')[0])
      }

      const { data, error } = await query

      if (error) throw error

      setRecords(data || [])
      calculateStats(data || [])
    } catch (error) {
      console.error('Failed to load attendance:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (data) => {
    const totalHours = data.reduce((sum, record) => {
      if (!record.clock_in || !record.clock_out) return sum
      const start = new Date(record.clock_in)
      const end = new Date(record.clock_out)
      const hours = (end - start) / (1000 * 60 * 60)
      return sum + hours
    }, 0)

    const daysWithHours = data.filter(r => r.clock_in && r.clock_out).length
    const avgHours = daysWithHours > 0 ? totalHours / daysWithHours : 0

    setStats({
      totalHours: totalHours.toFixed(1),
      totalDays: data.length,
      avgHours: avgHours.toFixed(1),
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  }

  const calculateDuration = (clockIn, clockOut) => {
    if (!clockIn || !clockOut) return '-- h -- m'
    const start = new Date(clockIn)
    const end = new Date(clockOut)
    const diff = end - start
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${mins}m`
  }

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Attendance</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Period Selector */}
      <div style={{ padding: '16px 20px', background: '#f5f5f7', borderBottom: '1px solid #e0e0e0' }}>
        <div className="period-chips">
          {['week', 'month', 'all'].map(p => (
            <button
              key={p}
              className={`period-chip ${period === p ? 'active' : ''}`}
              onClick={async () => {
                await Haptics.impact({ style: ImpactStyle.Light })
                setPeriod(p)
              }}
            >
              {p === 'week' ? 'Last 7 Days' : p === 'month' ? 'Last 30 Days' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ padding: '20px', background: '#f5f5f7' }}>
        <div className="stats-grid">
          <MobileCard small>
            <div className="stat-card">
              <Icon name="clock" size={24} color="#0066cc" />
              <div>
                <div className="stat-value">{stats.totalHours}h</div>
                <div className="stat-label">Total Hours</div>
              </div>
            </div>
          </MobileCard>

          <MobileCard small>
            <div className="stat-card">
              <Icon name="calendar" size={24} color="#34c759" />
              <div>
                <div className="stat-value">{stats.totalDays}</div>
                <div className="stat-label">Days Worked</div>
              </div>
            </div>
          </MobileCard>

          <MobileCard small>
            <div className="stat-card">
              <Icon name="barChart" size={24} color="#ff9500" />
              <div>
                <div className="stat-value">{stats.avgHours}h</div>
                <div className="stat-label">Avg Per Day</div>
              </div>
            </div>
          </MobileCard>
        </div>
      </div>

      {/* Attendance Records */}
      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="spinner" />
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Icon name="clock" size={48} color="#d2d2d7" />
            <p style={{ marginTop: 16, fontSize: 15, color: '#86868b' }}>
              No attendance records
            </p>
          </div>
        ) : (
          <div className="records-list">
            {records.map(record => (
              <MobileCard key={record.id}>
                <div className="record-item">
                  <div className="record-header">
                    <div className="record-date">{formatDate(record.date)}</div>
                    <div className="record-duration">{calculateDuration(record.clock_in, record.clock_out)}</div>
                  </div>

                  <div className="record-times">
                    <div className="time-block">
                      <div className="time-label">Clock In</div>
                      <div className="time-value">
                        <Icon name="arrowRight" size={16} color="#34c759" />
                        {formatTime(record.clock_in)}
                      </div>
                    </div>

                    <div className="time-block">
                      <div className="time-label">Clock Out</div>
                      <div className="time-value">
                        <Icon name="arrowLeft" size={16} color="#ff3b30" />
                        {formatTime(record.clock_out)}
                      </div>
                    </div>
                  </div>

                  {record.location_name && (
                    <div className="record-location">
                      <Icon name="mapPin" size={14} color="#86868b" />
                      <span>{record.location_name}</span>
                    </div>
                  )}
                </div>
              </MobileCard>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .period-chips {
          display: flex;
          gap: 8px;
        }

        .period-chip {
          flex: 1;
          padding: 8px 12px;
          background: white;
          border: 1px solid #d2d2d7;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #1a1a1a;
          cursor: pointer;
        }

        .period-chip.active {
          background: #0066cc;
          color: white;
          border-color: #0066cc;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 2px;
        }

        .stat-label {
          font-size: 11px;
          color: #86868b;
        }

        .records-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .record-item {
          padding: 4px;
        }

        .record-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .record-date {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .record-duration {
          font-size: 16px;
          font-weight: 700;
          color: #0066cc;
        }

        .record-times {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }

        .time-block {
          background: #f5f5f7;
          padding: 12px;
          border-radius: 8px;
        }

        .time-label {
          font-size: 11px;
          color: #86868b;
          margin-bottom: 6px;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .time-value {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .record-location {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #86868b;
          padding-top: 8px;
          border-top: 1px solid #f5f5f7;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #d2d2d7;
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
