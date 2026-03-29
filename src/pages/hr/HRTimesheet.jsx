import { useState, useEffect, useRef } from 'react'
import { LogIn, LogOut, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { supabase } from '../../utils/supabase'
import { useMsal } from '@azure/msal-react'

const fmt = iso => iso ? new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '—'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : '—'
const calcHours = (a,b) => b ? parseFloat(((new Date(b)-new Date(a))/3600000).toFixed(2)) : null
const toLocal = iso => { if(!iso) return ''; const d=new Date(iso),pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
const getWeek = (offset=0) => { const n=new Date(),day=n.getDay(),m=new Date(n); m.setDate(n.getDate()-(day===0?6:day-1)+offset*7); m.setHours(0,0,0,0); const s=new Date(m); s.setDate(m.getDate()+6); s.setHours(23,59,59,999); return { start:m,end:s } }
const fmtWeek = offset => { const {start,end}=getWeek(offset); return `${start.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}` }

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">{title}</span><button onClick={onClose} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
  )
}

export default function HRTimesheet() {
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase()||''
  const [isManager,setIsManager] = useState(false)
  const [clockedIn,setClockedIn] = useState(false)
  const [active,setActive] = useState(null)
  const [elapsed,setElapsed] = useState('')
  const [myLogs,setMyLogs] = useState([])
  const [teamLogs,setTeamLogs] = useState([])
  const [loading,setLoading] = useState(true)
  const [clocking,setClocking] = useState(false)
  const [weekOffset,setWeekOffset] = useState(0)
  const [msUsers,setMsUsers] = useState([])
  const [expandedUser,setExpandedUser] = useState(null)
  const [editModal,setEditModal] = useState(false)
  const [editForm,setEditForm] = useState({})
  const [editTarget,setEditTarget] = useState(null)
  const [editSaving,setEditSaving] = useState(false)
  const [addModal,setAddModal] = useState(false)
  const [addForm,setAddForm] = useState({user_email:'',clock_in:'',clock_out:'',note:''})
  const [addSaving,setAddSaving] = useState(false)

  useEffect(()=>{checkRole()},[myEmail])
  useEffect(()=>{if(myEmail){checkIn();fetchMy()}},[myEmail,weekOffset])
  useEffect(()=>{if(isManager){fetchTeam();fetchUsers()}},[isManager,weekOffset])
  useEffect(()=>{
    if(!clockedIn||!active) return
    const t = setInterval(()=>{
      const diff = Date.now()-new Date(active.clock_in).getTime()
      const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000)
      setElapsed(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    },1000)
    return ()=>clearInterval(t)
  },[clockedIn,active])

  const checkRole = async ()=>{
    const {data}=await supabase.from('user_permissions').select('permissions').ilike('user_email',myEmail).maybeSingle()
    const p=data?.permissions; setIsManager(!p||p.admin===true||p.hr_manage===true)
  }
  const checkIn = async ()=>{
    const {data}=await supabase.from('timesheets').select('*').ilike('user_email',myEmail).is('clock_out',null).maybeSingle()
    if(data){setClockedIn(true);setActive(data)}else{setClockedIn(false);setActive(null);setElapsed('')}
  }
  const fetchMy = async ()=>{
    setLoading(true)
    const {start,end}=getWeek(weekOffset)
    const {data}=await supabase.from('timesheets').select('*').ilike('user_email',myEmail).gte('clock_in',start.toISOString()).lte('clock_in',end.toISOString()).order('clock_in',{ascending:false})
    setMyLogs(data||[]); setLoading(false)
  }
  const fetchTeam = async ()=>{
    const {start,end}=getWeek(weekOffset)
    const {data}=await supabase.from('timesheets').select('*').gte('clock_in',start.toISOString()).lte('clock_in',end.toISOString()).order('user_name',{ascending:true}).order('clock_in',{ascending:false})
    setTeamLogs(data||[])
  }
  const fetchUsers = async ()=>{
    try{
      const token=(await instance.acquireTokenSilent({scopes:['https://graph.microsoft.com/User.Read.All'],account:me})).accessToken
      const r=await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=50&$filter=accountEnabled eq true',{headers:{Authorization:`Bearer ${token}`}})
      const d=await r.json(); setMsUsers((d.value||[]).filter(u=>u.userPrincipalName?.includes('dhwebsiteservices')&&!u.userPrincipalName.includes('#EXT#')))
    }catch{setMsUsers([])}
  }

  const clockIn = async ()=>{
    setClocking(true)
    const {data}=await supabase.from('timesheets').insert([{user_email:myEmail,user_name:me?.name||myEmail,clock_in:new Date().toISOString()}]).select().single()
    setActive(data);setClockedIn(true);setClocking(false);fetchMy()
  }
  const clockOut = async ()=>{
    setClocking(true)
    const now=new Date()
    const hours=calcHours(active.clock_in,now.toISOString())
    await supabase.from('timesheets').update({clock_out:now.toISOString(),hours}).eq('id',active.id)
    setClockedIn(false);setActive(null);setElapsed('');setClocking(false);fetchMy()
  }
  const openEdit = e=>{setEditTarget(e);setEditForm({clock_in:toLocal(e.clock_in),clock_out:toLocal(e.clock_out),note:e.note||''});setEditModal(true)}
  const saveEdit = async ()=>{
    setEditSaving(true)
    const inISO=new Date(editForm.clock_in).toISOString()
    const outISO=editForm.clock_out?new Date(editForm.clock_out).toISOString():null
    const hours=outISO?calcHours(inISO,outISO):null
    await supabase.from('timesheets').update({clock_in:inISO,clock_out:outISO,hours,note:editForm.note}).eq('id',editTarget.id)
    setEditSaving(false);setEditModal(false);fetchMy();if(isManager)fetchTeam()
  }
  const del = async id=>{if(!confirm('Delete this entry?'))return;await supabase.from('timesheets').delete().eq('id',id);fetchMy();if(isManager)fetchTeam()}
  const addShift = async ()=>{
    setAddSaving(true)
    const usr=msUsers.find(u=>u.userPrincipalName===addForm.user_email)
    const inISO=new Date(addForm.clock_in).toISOString()
    const outISO=addForm.clock_out?new Date(addForm.clock_out).toISOString():null
    const hours=outISO?calcHours(inISO,outISO):null
    await supabase.from('timesheets').insert([{user_email:addForm.user_email?.toLowerCase(),user_name:usr?.displayName||addForm.user_email,clock_in:inISO,clock_out:outISO,hours,note:addForm.note,added_by:myEmail,created_at:new Date().toISOString()}])
    setAddSaving(false);setAddModal(false);setAddForm({user_email:'',clock_in:'',clock_out:'',note:''});fetchTeam()
  }

  const myTotal = myLogs.filter(l=>l.hours).reduce((a,b)=>a+(b.hours||0),0).toFixed(1)
  const grouped = teamLogs.reduce((acc,l)=>{
    const k=l.user_email?.toLowerCase()
    if(!acc[k]) acc[k]={name:l.user_name||l.user_email,email:k,entries:[],total:0}
    acc[k].entries.push(l); acc[k].total+=l.hours||0; return acc
  },{})

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Timesheet</h1>
          <p className="page-sub">{myTotal}h this week</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={()=>setWeekOffset(o=>o-1)} className="btn btn-outline btn-sm btn-icon"><ChevronLeft size={14}/></button>
          <span style={{fontFamily:'var(--font-mono)',fontSize:11,letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{fmtWeek(weekOffset)}</span>
          <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} className="btn btn-outline btn-sm btn-icon" disabled={weekOffset===0}><ChevronRight size={14}/></button>
          {weekOffset!==0 && <button onClick={()=>setWeekOffset(0)} style={{fontSize:12,color:'var(--gold)',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>This week</button>}
        </div>
      </div>

      {/* Clock in/out */}
      <div className="card card-pad" style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Time Clock</div>
            {clockedIn && active ? (
              <div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:22,fontWeight:600,color:'var(--green)',letterSpacing:'0.05em'}}>{elapsed||'00:00:00'}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',marginTop:3,letterSpacing:'0.08em'}}>CLOCKED IN AT {fmt(active.clock_in)}</div>
              </div>
            ) : (
              <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--faint)',letterSpacing:'0.08em'}}>NOT CLOCKED IN</div>
            )}
          </div>
          <div style={{display:'flex',gap:10}}>
            {isManager && <button onClick={()=>setAddModal(true)} className="btn btn-outline"><Plus size={13}/>Add Shift</button>}
            {clockedIn
              ? <button onClick={clockOut} disabled={clocking} className="btn btn-danger" style={{background:'var(--red)',color:'#fff',border:'none'}}><LogOut size={14}/>{clocking?'Clocking out...':'Clock Out'}</button>
              : <button onClick={clockIn} disabled={clocking} className="btn btn-primary" style={{background:'var(--green)',border:'none'}}><LogIn size={14}/>{clocking?'Clocking in...':'Clock In'}</button>
            }
          </div>
        </div>
      </div>

      {/* My logs */}
      <div className="card" style={{marginBottom:20,overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:14,fontWeight:600}}>My Hours</div>
          <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--gold)',fontWeight:600}}>{myTotal}h total</span>
        </div>
        {loading ? <div className="spin-center"><div className="spin"/></div> : myLogs.length===0 ? (
          <div className="empty"><p>No hours logged this week</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {myLogs.map(l=>(
                <tr key={l.id}>
                  <td className="text-main">{fmtDate(l.clock_in)}</td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(l.clock_in)}</span></td>
                  <td><span style={{fontFamily:'var(--font-mono)',fontSize:12}}>{fmt(l.clock_out)}</span></td>
                  <td>{l.hours ? <span className="badge badge-gold">{l.hours}h</span> : <span className="badge badge-amber">Active</span>}</td>
                  <td style={{maxWidth:150}}>{l.note}</td>
                  <td>
                    <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                      <button onClick={()=>openEdit(l)} className="btn btn-ghost btn-sm btn-icon"><Edit2 size={11}/></button>
                      <button onClick={()=>del(l.id)} className="btn btn-ghost btn-sm btn-icon" style={{color:'var(--red)'}}><Trash2 size={11}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Team view for managers */}
      {isManager && Object.keys(grouped).length>0 && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:14,fontWeight:600}}>Team Hours</div>
          </div>
          {Object.values(grouped).map(member=>(
            <div key={member.email} style={{borderBottom:'1px solid var(--border)'}}>
              <div onClick={()=>setExpandedUser(expandedUser===member.email?null:member.email)} style={{padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:expandedUser===member.email?'var(--bg2)':'transparent',transition:'background 0.15s'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--gold)'}}>{member.name[0].toUpperCase()}</div>
                  <span style={{fontSize:13.5,fontWeight:500}}>{member.name}</span>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:12,fontWeight:600,color:'var(--gold)'}}>{member.total.toFixed(1)}h</span>
              </div>
              {expandedUser===member.email && (
                <div style={{padding:'0 20px 12px',background:'var(--bg2)'}}>
                  <table className="tbl" style={{background:'transparent'}}>
                    <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Note</th></tr></thead>
                    <tbody>
                      {member.entries.map(l=>(
                        <tr key={l.id}>
                          <td>{fmtDate(l.clock_in)}</td>
                          <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{fmt(l.clock_in)}</span></td>
                          <td><span style={{fontFamily:'var(--font-mono)',fontSize:11}}>{fmt(l.clock_out)}</span></td>
                          <td>{l.hours?<span className="badge badge-gold badge-sm">{l.hours}h</span>:<span className="badge badge-amber">Active</span>}</td>
                          <td>{l.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editModal && <Modal title="Edit Entry" onClose={()=>setEditModal(false)} footer={<><button onClick={()=>setEditModal(false)} className="btn btn-outline">Cancel</button><button onClick={saveEdit} disabled={editSaving} className="btn btn-primary">{editSaving?'Saving...':'Save'}</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div><label className="inp-label">Clock In</label><input className="inp" type="datetime-local" value={editForm.clock_in} onChange={e=>setEditForm(p=>({...p,clock_in:e.target.value}))} /></div>
          <div><label className="inp-label">Clock Out</label><input className="inp" type="datetime-local" value={editForm.clock_out} onChange={e=>setEditForm(p=>({...p,clock_out:e.target.value}))} /></div>
          <div><label className="inp-label">Note</label><input className="inp" value={editForm.note} onChange={e=>setEditForm(p=>({...p,note:e.target.value}))} /></div>
        </div>
      </div></div>)}}

      {/* Add shift modal */}
      {addModal && <Modal title="Add Shift" onClose={()=>setAddModal(false)} footer={<><button onClick={()=>setAddModal(false)} className="btn btn-outline">Cancel</button><button onClick={addShift} disabled={addSaving||!addForm.user_email||!addForm.clock_in} className="btn btn-primary">{addSaving?'Saving...':'Add Shift'}</button></>}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div><label className="inp-label">Staff Member</label>
            <select className="inp" value={addForm.user_email} onChange={e=>setAddForm(p=>({...p,user_email:e.target.value}))}>
              <option value="">Select...</option>
              {msUsers.map(u=><option key={u.userPrincipalName} value={u.userPrincipalName}>{u.displayName}</option>)}
            </select>
          </div>
          <div><label className="inp-label">Clock In</label><input className="inp" type="datetime-local" value={addForm.clock_in} onChange={e=>setAddForm(p=>({...p,clock_in:e.target.value}))} /></div>
          <div><label className="inp-label">Clock Out</label><input className="inp" type="datetime-local" value={addForm.clock_out} onChange={e=>setAddForm(p=>({...p,clock_out:e.target.value}))} /></div>
          <div><label className="inp-label">Note</label><input className="inp" value={addForm.note} onChange={e=>setAddForm(p=>({...p,note:e.target.value}))} /></div>
        
      )}}
    
  )
}
