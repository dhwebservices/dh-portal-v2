import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import Icon from '../components/Icon'
import { Screen, Sec, Seg, Empty, Loading } from '../components/UI'

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
    <Screen title="Attendance" onBack={goBack}>
      <Seg
        value={period}
        onChange={setPeriod}
        options={[{ value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' }, { value: 'all', label: 'All time' }]}
      />

      <div className="dh-tiles t3">
        <div className="dh-tile"><span className="dh-num">{stats.totalDays}</span><span className="dh-sub">Days worked</span></div>
        <div className="dh-tile"><span className="dh-num">{stats.totalHours}h</span><span className="dh-sub">Total hours</span></div>
        <div className="dh-tile"><span className="dh-num">{stats.avgHours}h</span><span className="dh-sub">Avg per day</span></div>
      </div>

      <Sec>Clock-ins</Sec>
      {loading ? <Loading /> : records.length === 0 ? (
        <Empty icon="clock" title="No attendance records" sub="Clock-ins show here." />
      ) : (
        <div className="dh-card">
          {records.map(record => (
            <div key={record.id} className="dh-row">
              <span className="dh-g" style={{ flex: 'none', width: 92 }}><span className="dh-t">{formatDate(record.date)}</span></span>
              <span className="dh-g">
                <span className="dh-sub">In {formatTime(record.clock_in)} · out {formatTime(record.clock_out)}</span>
                {record.office_location && <span className="dh-sub">{record.office_location}</span>}
              </span>
              <span className="dh-val">{calculateDuration(record.clock_in, record.clock_out)}</span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  )
}
