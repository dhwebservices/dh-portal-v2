import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Save, Send, Edit2, Check, AlertCircle, RefreshCw, Clock, CheckSquare } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const STATUS_CFG = {
  available:   { label:'Available',   color:'var(--green)',  bg:'rgba(58,125,68,0.08)',  border:'rgba(58,125,68,0.25)'  },
  partial:     { label:'Partial',     color:'var(--amber)',  bg:'rgba(196,122,26,0.08)', border:'rgba(196,122,26,0.25)' },
  unavailable: { label:'Unavailable', color:'var(--red)',    bg:'rgba(192,57,43,0.08)',  border:'rgba(192,57,43,0.25)'  },
  not_set:     { label:'Not Set',     color:'var(--faint)',  bg:'var(--bg2)',             border:'var(--border)'         },
}
const getWeekStart = d => { const s=new Date(d),day=s.getDay();s.setDate(s.getDate()-day+(day===0?-6:1));s.setHours(0,0,0,0);return s }
const weekKey = d => { const s=getWeekStart(d);return `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}` }
const formatWeek = d => { const s=getWeekStart(d),e=new Date(s);e.setDate(e.getDate()+6);return `${s.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}` }
const dayDate = (ws,i) => { const d=new Date(ws);d.setDate(d.getDate()+i);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) }
const emptyWeek = () => Object.fromEntries(DAYS.map(d=>[d,{status:'not_set',start:'09:00',end:'17:00',note:''}]))

function DayEditor({ data, setData, weekStart, disabled }) {
  const upd = (day,field,value) => setData(p=>({...p,[day]:{...p[day],[field]:value}}))
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      {DAYS.map((day,i) => {
        const d = data?.[day]||{status:'not_set',start:'09:00',end:'17:00',note:''}
        const cfg = STATUS_CFG[d.status]||STATUS_CFG.not_set
        return (
          <div key={day} style={{padding:'12px 14px',background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{minWidth:90}}>
                <div style={{fontSize:13,fontWeight:600}}>{day}</div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)'}}>{dayDate(weekStart,i)}</div>
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {Object.entries(STATUS_CFG).filter(([k])=>k!=='not_set').map(([key,c])=>(
                  <button key={key} disabled={disabled} onClick={()=>!disabled&&upd(day,'status',key)} style={{padding:'3px 10px',borderRadius:100,border:'1px solid',fontSize:12,cursor:disabled?'default':'pointer',borderColor:d.status===key?c.color:'var(--border)',background:d.status===key?c.bg:'transparent',color:d.status===key?c.color:'var(--sub)',fontWeight:d.status===key?700:400,transition:'all 0.15s'}}>{c.label}</button>
                ))}
              </div>
              {(d.status==='available'||d.status==='partial') && (
                <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}}>
                  <Clock size={11} color="var(--sub)" />
                  <input type="time" value={d.start} disabled={disabled} onChange={e=>upd(day,'start',e.target.value)} className="inp" style={{width:90,padding:'3px 8px',fontSize:12}} />
                  <span style={{fontSize:11,color:'var(--sub)'}}>–</span>
                  <input type="time" value={d.end} disabled={disabled} onChange={e=>upd(day,'end',e.target.value)} className="inp" style={{width:90,padding:'3px 8px',fontSize:12}} />
                </div>
              )}
            </div>
            {!disabled ? (
              <input value={d.note||''} onChange={e=>upd(day,'note',e.target.value)} placeholder="Add a note..." style={{width:'100%',marginTop:8,background:'transparent',border:'none',borderBottom:'1px solid var(--border)',padding:'3px 0',color:'var(--sub)',fontSize:12,boxSizing:'border-box',outline:'none'}} />
            ) : d.note ? (
              <div style={{fontSize:12,color:'var(--sub)',marginTop:6}}>{d.note}</div>
            ) : null}
          </div>
        )
      })}
  )
}

export default function Schedule() {
  const { accounts } = useMsal()
  const me = accounts[0]
  const myEmail = me?.username?.toLowerCase()||''
  const [isManager,setIsManager] = useState(false)
  const [weekStart,setWeekStart] = useState(getWeekStart(new Date()))
  const [myData,setMyData] = useState(emptyWeek())
  const [myRecord,setMyRecord] = useState(null)
  const [submitted,setSubmitted] = useState(false)
  const [teamData,setTeamData] = useState([])
  const [teamTasks,setTeamTasks] = useState({})
  const [staffList,setStaffList] = useState([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [flashSaved,setFlashSaved] = useState(false)
  const [editModal,setEditModal] = useState(false)
  const [editTarget,setEditTarget] = useState(null)
  const [editForm,setEditForm] = useState(emptyWeek())
  const [editSaving,setEditSaving] = useState(false)
  const [addForModal,setAddForModal] = useState(false)
  const [addForEmail,setAddForEmail] = useState('')
  const [addForName,setAddForName] = useState('')
  const [addForForm,setAddForForm] = useState(emptyWeek())
  const [addForSaving,setAddForSaving] = useState(false)
  const wk = weekKey(weekStart)

  useEffect(() => {
    if (!myEmail) return
    const init = async () => {
      const { data: allPerms } = await supabase.from('user_permissions').select('user_email,permissions,onboarding')
      const myRow = (allPerms||[]).find(r=>r.user_email?.toLowerCase()===myEmail)
      setIsManager(!myRow?.permissions||Object.keys(myRow.permissions||{}).length===0||myRow.permissions.admin===true)
      const { data: staff } = await supabase.from('hr_profiles').select('user_email,full_name').order('full_name')
      setStaffList(staff||[])
    }
    init()
  }, [myEmail])

  useEffect(() => { if (myEmail) loadAll() }, [wk,myEmail,isManager])

  const loadAll = async () => {
    setLoading(true)
    const { data: all } = await supabase.from('schedules').select('*').eq('week_start',wk)
    const mine = (all||[]).find(s=>s.user_email?.toLowerCase()===myEmail)
    if (mine) { setMyRecord(mine); setMyData(mine.week_data||emptyWeek()); setSubmitted(mine.submitted||false) }
    else { setMyRecord(null); setMyData(emptyWeek()); setSubmitted(false) }
    const team = (all||[]).filter(s=>s.user_email?.toLowerCase()!==myEmail)
    setTeamData(team)
    const { data: tasks } = await supabase.from('tasks').select('assigned_to_email,title,status,due_date,priority').neq('status','done')
    const tm = {}; (tasks||[]).forEach(t=>{ const k=t.assigned_to_email?.toLowerCase(); if(!tm[k]) tm[k]=[]; tm[k].push(t) })
    setTeamTasks(tm)
    setLoading(false)
  }

  const saveDraft = async () => {
    setSaving(true)
    const payload = { user_email:myEmail,user_name:me?.name||myEmail,week_start:wk,week_data:myData,submitted:false,updated_at:new Date().toISOString() }
    if (myRecord?.id) await supabase.from('schedules').update(payload).eq('id',myRecord.id)
    else { const { data } = await supabase.from('schedules').insert([{...payload,created_at:new Date().toISOString()}]).select().single(); setMyRecord(data) }
    setSaving(false); setFlashSaved(true); setTimeout(()=>setFlashSaved(false),2500)
  }

  const submitSchedule = async () => {
    setSaving(true)
    const payload = { user_email:myEmail,user_name:me?.name||myEmail,week_start:wk,week_data:myData,submitted:true,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString() }
    if (myRecord?.id) await supabase.from('schedules').update(payload).eq('id',myRecord.id)
    else { const { data } = await supabase.from('schedules').insert([{...payload,created_at:new Date().toISOString()}]).select().single(); setMyRecord(data) }
    setSubmitted(true); setSaving(false)
    await loadAll()
    try {
      await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:['david@dhwebsiteservices.co.uk'],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:`Schedule Submitted — ${me?.name||myEmail} (${formatWeek(weekStart)})`,html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>${me?.name||myEmail} submitted their schedule</h2><p>Week: ${formatWeek(weekStart)}</p></div>`}})})
    } catch(e) { console.error(e) }
  }

  const openEdit = rec => { setEditTarget(rec); setEditForm(rec.week_data||emptyWeek()); setEditModal(true) }
  const saveEdit = async () => {
    setEditSaving(true)
    await supabase.from('schedules').update({week_data:editForm,manager_edited:true,manager_email:myEmail,manager_name:me?.name||myEmail,updated_at:new Date().toISOString()}).eq('id',editTarget.id)
    try { await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'custom_email',data:{to:[editTarget.user_email],from:'DH Website Services <noreply@dhwebsiteservices.co.uk>',subject:`Schedule Updated — ${formatWeek(weekStart)}`,html:`<div style="font-family:Arial,sans-serif;padding:24px"><h2>Schedule Updated</h2><p>Your schedule for ${formatWeek(weekStart)} was updated by ${me?.name||myEmail}.</p></div>`}})}) } catch(e){}
    await loadAll(); setEditSaving(false); setEditModal(false)
  }

  const saveForStaff = async () => {
    if (!addForEmail) return; setAddForSaving(true)
    const payload = { user_email:addForEmail,user_name:addForName,week_start:wk,week_data:addForForm,submitted:true,submitted_at:new Date().toISOString(),manager_edited:true,manager_email:myEmail,manager_name:me?.name||myEmail,updated_at:new Date().toISOString() }
    const { data: all2 } = await supabase.from('schedules').select('id,user_email').eq('week_start',wk)
    const ex = (all2||[]).find(s=>s.user_email?.toLowerCase()===addForEmail.toLowerCase())
    if (ex?.id) await supabase.from('schedules').update(payload).eq('id',ex.id)
    else await supabase.from('schedules').insert([{...payload,created_at:new Date().toISOString()}])
    await loadAll(); setAddForSaving(false); setAddForModal(false); setAddForEmail(''); setAddForName(''); setAddForForm(emptyWeek())
  }

  const PRICOLOR = { low:'var(--sub)',normal:'var(--gold)',high:'var(--amber)',urgent:'var(--red)' }
  const notSubmitted = isManager ? teamData.filter(s=>!s.submitted) : []
  const fullTeam = isManager ? staffList.filter(s=>s.user_email?.toLowerCase()!==myEmail).map(s=>({...s,schedule:teamData.find(t=>t.user_email?.toLowerCase()===s.user_email?.toLowerCase()),tasks:teamTasks[s.user_email?.toLowerCase()]||[]})) : []

  return (
    <div className="fade-in">
      {/* Week nav */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(getWeekStart(d))}} className="btn btn-outline btn-sm btn-icon"><ChevronLeft size={14}/></button>
          <span style={{fontFamily:'var(--font-display)',fontSize:16,fontWeight:600,letterSpacing:'-0.01em'}}>{formatWeek(weekStart)}</span>
          <button onClick={()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(getWeekStart(d))}} className="btn btn-outline btn-sm btn-icon"><ChevronRight size={14}/></button>
          <button onClick={()=>setWeekStart(getWeekStart(new Date()))} style={{fontSize:12,color:'var(--gold)',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>This week</button>
        </div>
        <button onClick={loadAll} className="btn btn-ghost btn-sm"><RefreshCw size={12}/>Refresh</button>
      </div>

      {isManager && notSubmitted.length>0 && (
        <div style={{padding:'12px 16px',background:'var(--amber-bg)',border:'1px solid rgba(196,122,26,0.25)',borderRadius:8,marginBottom:20,fontSize:13,color:'var(--amber)',display:'flex',gap:8,alignItems:'center'}}>
          <AlertCircle size={14}/> <strong>{notSubmitted.length}</strong> team member{notSubmitted.length!==1?"s haven't":" hasn't"} submitted for this week
        </div>
      )}

      {/* My schedule */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:3}}>My Availability</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:submitted?'var(--green)':myRecord?'var(--amber)':'var(--faint)',letterSpacing:'0.06em'}}>
              {submitted?'SUBMITTED':myRecord?'DRAFT — NOT SUBMITTED':'NOT FILLED IN'}
              {myRecord?.manager_edited&&<span style={{color:'var(--gold)',marginLeft:8}}>· Edited by manager</span>}
            </div>
          </div>
          {submitted && <button onClick={()=>setSubmitted(false)} className="btn btn-outline btn-sm">Edit</button>}
        </div>
        <div style={{padding:'16px 20px'}}>
          {loading ? <div className="spin-center"><div className="spin"/></div> : (
            <>
              <DayEditor data={myData} setData={setMyData} weekStart={weekStart} disabled={submitted} />
              {!submitted && (
                <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:16,paddingTop:16,borderTop:'1px solid var(--border)',alignItems:'center'}}>
                  {flashSaved && <span style={{fontSize:12,color:'var(--green)',fontFamily:'var(--font-mono)',letterSpacing:'0.06em'}}>SAVED</span>}
                  <button onClick={saveDraft} disabled={saving} className="btn btn-outline btn-sm"><Save size={12}/>{saving?'Saving...':'Save Draft'}</button>
                  <button onClick={submitSchedule} disabled={saving} className="btn btn-primary"><Send size={12}/>{saving?'Submitting...':'Submit'}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Team schedule */}
      {isManager && (
        <div className="card">
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontSize:14,fontWeight:600}}>Team Schedule</div>
            <button onClick={()=>{setAddForEmail('');setAddForName('');setAddForForm(emptyWeek());setAddForModal(true)}} className="btn btn-outline btn-sm"><CheckSquare size={12}/>Set Staff Schedule</button>
          </div>
          <div style={{padding:'16px 20px'}}>
            {loading ? <div className="spin-center"><div className="spin"/></div> : fullTeam.length===0 ? (
              <div className="empty"><p>No staff found in HR Profiles</p></div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {fullTeam.map(member=>(
                  <div key={member.user_email} style={{border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}}>
                    <div style={{padding:'12px 16px',background:'var(--bg2)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'var(--gold-bg)',border:'1px solid var(--gold-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'var(--gold)'}}>
                          {(member.full_name||member.user_email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600}}>{member.full_name||member.user_email}</div>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.08em',color:member.schedule?.submitted?'var(--green)':'var(--amber)'}}>
                            {member.schedule?.submitted?'SUBMITTED':'NOT SUBMITTED'}
                            {member.schedule?.manager_edited&&<span style={{color:'var(--gold)',marginLeft:8}}>· EDITED BY MANAGER</span>}
                          </div>
                        </div>
                      </div>
                      {member.schedule && <button onClick={()=>openEdit(member.schedule)} className="btn btn-outline btn-sm"><Edit2 size={11}/>Edit</button>}
                    </div>
                    <div style={{padding:'12px 16px'}}>
                      {!member.schedule ? <p style={{fontSize:12,color:'var(--faint)',textAlign:'center'}}>No schedule submitted yet</p> : (
                        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:member.tasks.length>0?12:0}}>
                          {DAYS.map((day,i)=>{
                            const d=member.schedule.week_data?.[day]; const cfg=STATUS_CFG[d?.status||'not_set']
                            return (
                              <div key={day} style={{textAlign:'center'}}>
                                <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--faint)',marginBottom:3}}>{day.slice(0,3).toUpperCase()}</div>
                                <div title={cfg.label} style={{height:36,borderRadius:6,background:cfg.bg,border:`1px solid ${cfg.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                                  <span style={{fontSize:12,color:cfg.color}}>{d?.status==='available'?'✓':d?.status==='partial'?'~':d?.status==='unavailable'?'✗':'?'}</span>
                                  {(d?.status==='available'||d?.status==='partial')&&d?.start&&<span style={{fontSize:8,color:cfg.color}}>{d.start}</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {member.tasks.length>0 && (
                        <div style={{paddingTop:member.schedule?12:0,borderTop:member.schedule?'1px solid var(--border)':'none'}}>
                          <div style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--faint)',marginBottom:8}}>Active Tasks ({member.tasks.length})</div>
                          {member.tasks.slice(0,3).map((t,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:i<Math.min(member.tasks.length,3)-1?'1px solid var(--border)':'none'}}>
                              <div style={{width:6,height:6,borderRadius:'50%',background:PRICOLOR[t.priority]||'var(--gold)',flexShrink:0}}/>
                              <span style={{fontSize:12.5,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title}</span>
                              {t.due_date&&<span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',flexShrink:0}}>{new Date(t.due_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>}
                            </div>
                          ))}
                          {member.tasks.length>3&&<div style={{fontSize:12,color:'var(--faint)',marginTop:4}}>+{member.tasks.length-3} more</div>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && editTarget && (
        <div className="modal-backdrop" onClick={()=>setEditModal(false)}>
          <div className="modal" style={{maxWidth:640}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Edit Schedule — {editTarget.user_name}</span>
              <button onClick={()=>setEditModal(false)} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{padding:'10px 14px',background:'var(--amber-bg)',borderRadius:8,marginBottom:16,fontSize:13,color:'var(--amber)'}}>Editing on behalf of {editTarget.user_name} — they will be notified by email.</div>
              <DayEditor data={editForm} setData={setEditForm} weekStart={weekStart} disabled={false} />
            </div>
            <div className="modal-footer">
              <button onClick={()=>setEditModal(false)} className="btn btn-outline">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="btn btn-primary"><Check size={13}/>{editSaving?'Saving...':'Save & Notify'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add for staff modal */}
      {addForModal && (
        <div className="modal-backdrop" onClick={()=>setAddForModal(false)}>
          <div className="modal" style={{maxWidth:640}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Set Schedule for Staff Member</span>
              <button onClick={()=>setAddForModal(false)} style={{background:'none',border:'none',color:'var(--faint)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:16}}>
                <label className="inp-label">Staff Member</label>
                <select className="inp" value={addForEmail} onChange={e=>{const s=staffList.find(x=>x.user_email===e.target.value);setAddForEmail(e.target.value);setAddForName(s?.full_name||e.target.value)}}>
                  <option value="">Select a staff member...</option>
                  {staffList.filter(s=>s.user_email!==myEmail).map(s=><option key={s.user_email} value={s.user_email}>{s.full_name||s.user_email}</option>)}
                </select>
              </div>
              {addForEmail && <DayEditor data={addForForm} setData={setAddForForm} weekStart={weekStart} disabled={false} />}
            </div>
            {addForEmail && (
              <div className="modal-footer">
                <button onClick={()=>setAddForModal(false)} className="btn btn-outline">Cancel</button>
                <button onClick={saveForStaff} disabled={addForSaving} className="btn btn-primary"><Check size={13}/>{addForSaving?'Saving...':'Save & Notify'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
  </div>
  )
}
