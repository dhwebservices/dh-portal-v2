import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Button, FormInput, StatusBadge } from '../../components/ds'

export default function HRTimesheets() {
  const { user, can } = useAuth()
  const isManager = can('admin')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [clocked, setClocked] = useState(null)
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [filter, setFilter]   = useState('mine')

  useEffect(() => { load() }, [user?.email])
  const load = async () => {
    setLoading(true)
    const q = filter==='all' && isManager
      ? supabase.from('timesheets').select('*').order('clock_in',{ascending:false}).limit(100)
      : supabase.from('timesheets').select('*').ilike('user_email',user?.email||'').order('clock_in',{ascending:false}).limit(50)
    const { data } = await q
    setEntries(data||[])
    // Check if currently clocked in
    const open = (data||[]).find(e => e.user_email?.toLowerCase()===user?.email?.toLowerCase() && !e.clock_out)
    setClocked(open||null)
    setLoading(false)
  }

  const clockIn = async () => {
    setSaving(true)
    await supabase.from('timesheets').insert([{ user_email: user.email, user_name: user.name, clock_in: new Date().toISOString(), note }])
    setNote(''); setSaving(false); load()
  }

  const clockOut = async () => {
    setSaving(true)
    const now = new Date()
    const started = new Date(clocked.clock_in)
    const hours = (now - started) / 3600000
    await supabase.from('timesheets').update({ clock_out: now.toISOString(), hours: Math.round(hours*100)/100 }).eq('id', clocked.id)
    setSaving(false); load()
  }

  const totalHours = entries.filter(e=>e.user_email?.toLowerCase()===user?.email?.toLowerCase()).reduce((s,e)=>s+(e.hours||0),0)

  return (
    <div className="ds-content">
      <div className="ds-page-header"><div><h1>Timesheets</h1></div></div>

      {/* Clock in/out */}
      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20, marginBottom:20, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ flex:1 }}>
          {clocked ? (
            <div>
              <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:4 }}>Clocked in at <strong>{new Date(clocked.clock_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</strong></div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-green-500)' }}>● Currently working</div>
            </div>
          ) : (
            <div>
              <FormInput style={{ maxWidth:280 }} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note (e.g. Client calls)"/>
            </div>
          )}
        </div>
        {clocked
          ? <Button variant="primary" style={{ background:'var(--color-red-500)' }} onClick={clockOut} disabled={saving}>Clock Out</Button>
          : <Button variant="primary" onClick={clockIn} disabled={saving}>Clock In</Button>
        }
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, color:'var(--color-primary)' }}>{totalHours.toFixed(1)}h</div>
          <div style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>This month</div>
        </div>
      </div>

      {isManager && (
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['mine','My Entries'],['all','All Staff']].map(([k,l]) => (
            <Button key={k} variant={filter===k ? 'primary' : 'secondary'} onClick={() => { setFilter(k); load() }}>{l}</Button>
          ))}
        </div>
      )}

      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : entries.length===0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No timesheet entries</div> : (
          <table className="ds-table">
            <thead><tr>{isManager&&filter==='all'&&<th>Staff</th>}<th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Note</th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  {isManager&&filter==='all'&&<td>{e.user_name}</td>}
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(e.clock_in).toLocaleDateString('en-GB')}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(e.clock_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{e.clock_out ? new Date(e.clock_out).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : <span style={{ color:'var(--color-green-500)' }}>Active</span>}</td>
                  <td><StatusBadge variant="info">{e.hours ? e.hours+'h' : '—'}</StatusBadge></td>
                  <td>{e.note||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
