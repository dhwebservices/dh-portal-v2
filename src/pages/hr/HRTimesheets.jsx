import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'

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
    <div className="fade-in">
      <div className="page-hd"><div><h1 className="page-title">Timesheets</h1></div></div>

      {/* Clock in/out */}
      <div className="card card-pad" style={{ marginBottom:20, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ flex:1 }}>
          {clocked ? (
            <div>
              <div style={{ fontSize:13, color:'var(--sub)', marginBottom:4 }}>Clocked in at <strong>{new Date(clocked.clock_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</strong></div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--green)' }}>● Currently working</div>
            </div>
          ) : (
            <div>
              <input className="inp" style={{ maxWidth:280 }} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note (e.g. Client calls)"/>
            </div>
          )}
        </div>
        {clocked
          ? <button className="btn btn-danger" onClick={clockOut} disabled={saving}>Clock Out</button>
          : <button className="btn btn-primary" onClick={clockIn} disabled={saving}>Clock In</button>
        }
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--font-display)', color:'var(--accent)' }}>{totalHours.toFixed(1)}h</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.1em' }}>This month</div>
        </div>
      </div>

      {isManager && (
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['mine','My Entries'],['all','All Staff']].map(([k,l]) => (
            <button key={k} onClick={() => { setFilter(k); load() }} className={'pill'+(filter===k?' on':'')}>{l}</button>
          ))}
        </div>
      )}

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : entries.length===0 ? <div className="empty"><p>No timesheet entries</p></div> : (
          <table className="tbl">
            <thead><tr>{isManager&&filter==='all'&&<th>Staff</th>}<th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Note</th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  {isManager&&filter==='all'&&<td className="t-main">{e.user_name}</td>}
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(e.clock_in).toLocaleDateString('en-GB')}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(e.clock_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{e.clock_out ? new Date(e.clock_out).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : <span style={{ color:'var(--green)' }}>Active</span>}</td>
                  <td><span className="badge badge-blue">{e.hours ? e.hours+'h' : '—'}</span></td>
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
