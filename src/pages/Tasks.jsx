import { useState, useEffect } from 'react'
import { Plus, CheckCircle, Clock, AlertCircle, Trash2, Edit2, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useMsal } from '@azure/msal-react'
import { useLocation } from 'react-router-dom'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const PRIORITY_CFG = { low:{color:'var(--sub)',label:'Low'}, normal:{color:'var(--gold)',label:'Normal'}, high:{color:'var(--amber)',label:'High'}, urgent:{color:'var(--red)',label:'Urgent'} }
const STATUS_CFG   = { pending:{color:'var(--sub)',label:'To Do'}, in_progress:{color:'var(--blue)',label:'In Progress'}, done:{color:'var(--green)',label:'Done'} }
const EMPTY = { title:'',description:'',assigned_to_email:'',assigned_to_name:'',due_date:'',priority:'normal',status:'pending' }

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

function TaskRow({ task, isManage, onEdit, onDelete, onStatusChange, me }) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const p = PRIORITY_CFG[task.priority]||PRIORITY_CFG.normal
  const s = STATUS_CFG[task.status]||STATUS_CFG.pending

  const loadComments = async () => {
    if (!open) { const { data } = await supabase.from('task_comments').select('*').eq('task_id',task.id).order('created_at'); setComments(data||[]) }
    setOpen(o=>!o)
  }

  const postComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    await supabase.from('task_comments').insert([{ task_id:task.id, author_email:me?.username, author_name:me?.name||me?.username, body:newComment, created_at:new Date().toISOString() }])
    setNewComment(''); const { data } = await supabase.from('task_comments').select('*').eq('task_id',task.id).order('created_at'); setComments(data||[])
    setPosting(false)
  }

  return (
    <div style={{borderBottom:'1px solid var(--border)'}}>
      <div style={{display:'grid',gridTemplateColumns:'24px 1fr auto auto auto auto',gap:12,padding:'14px 16px',alignItems:'center'}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:p.color,marginTop:2}} />
        <div>
          <div style={{fontSize:13.5,fontWeight:500,color:'var(--text)',marginBottom:2}}>{task.title}</div>
          {task.description && <div style={{fontSize:12,color:'var(--faint)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:300}}>{task.description}</div>}
        </div>
        {isManage && <div style={{fontSize:12,color:'var(--sub)',whiteSpace:'nowrap'}}>{task.assigned_to_name||task.assigned_to_email}</div>}
        {task.due_date && <div style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',whiteSpace:'nowrap'}}>{new Date(task.due_date).toLocaleDateString('en-GB')}</div>}
        <select value={task.status} onChange={e=>onStatusChange(task.id,e.target.value)} className="inp" style={{padding:'4px 8px',fontSize:12,width:'auto',minWidth:120}}>
          {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{display:'flex',gap:4}}>
          <button onClick={loadComments} className="btn btn-ghost btn-sm btn-icon" title="Comments">{open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</button>
          {isManage && <button onClick={()=>onEdit(task)} className="btn btn-ghost btn-sm btn-icon"><Edit2 size={12}/></button>}
          {isManage && <button onClick={()=>onDelete(task)} className="btn btn-ghost btn-sm btn-icon" style={{color:'var(--red)'}}><Trash2 size={12}/></button>}
        </div>
      </div>
      {open && (
        <div style={{padding:'0 16px 14px',borderTop:'1px solid var(--border)',background:'var(--bg2)'}}>
          {comments.length===0 ? <p style={{fontSize:12,color:'var(--faint)',padding:'10px 0'}}>No comments yet</p> : (
            <div style={{display:'flex',flexDirection:'column',gap:8,padding:'10px 0'}}>
              {comments.map(c=>(
                <div key={c.id} style={{fontSize:12.5}}>
                  <span style={{fontWeight:600,marginRight:6}}>{c.author_name}</span>
                  <span style={{color:'var(--sub)'}}>{c.body}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--faint)',marginLeft:8}}>{new Date(c.created_at).toLocaleDateString('en-GB')}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <input className="inp" style={{flex:1,padding:'7px 12px',fontSize:12}} value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Add comment..." onKeyDown={e=>e.key==='Enter'&&postComment()} />
            <button onClick={postComment} disabled={posting} className="btn btn-primary btn-sm"><Send size={11}/></button>
          </div>
        </div>
      )}
  )
}

export default function Tasks() {
  const { accounts, instance } = useMsal()
  const me = accounts[0]
  const location = useLocation()
  const isManage = location.pathname === '/tasks'
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({...EMPTY})
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('active')

  useEffect(() => { loadTasks(); loadUsers() }, [isManage, me?.username])

  const loadTasks = async () => {
    setLoading(true)
    let q = supabase.from('tasks').select('*')
    if (!isManage) q = q.ilike('assigned_to_email', me?.username?.toLowerCase()||'')
    const { data } = await q.order('created_at',{ascending:false})
    setTasks(data||[])
    setLoading(false)
  }

  const loadUsers = async () => {
    try {
      const token = (await instance.acquireTokenSilent({ scopes:['https://graph.microsoft.com/User.Read.All'], account:me })).accessToken
      const r = await fetch('https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=50',{headers:{Authorization:`Bearer ${token}`}})
      const d = await r.json()
      setUsers(d.value||[])
    } catch { setUsers([]) }
  }

  const filtered = tasks.filter(t => filter==='active' ? t.status!=='done' : filter==='done' ? t.status==='done' : true)

  const openAdd = () => { setForm({...EMPTY}); setEditing(null); setModal(true) }
  const openEdit = t => { setForm({...t}); setEditing(t); setModal(true) }
  const close = () => { setModal(false); setEditing(null) }
  const u = (k,v) => setForm(p=>({...p,[k]:v}))

  const save = async () => {
    setSaving(true)
    const user = users.find(u=>u.userPrincipalName===form.assigned_to_email)
    const payload = { ...form, assigned_to_name: user?.displayName||form.assigned_to_name }
    if (editing) {
      await supabase.from('tasks').update(payload).eq('id',editing.id)
    } else {
      await supabase.from('tasks').insert([{...payload, created_by:me?.name||me?.username}])
      // Email assigned user
      if (payload.assigned_to_email) {
        await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'task_assigned',data:{to:payload.assigned_to_email,taskTitle:payload.title,assignedBy:me?.name||me?.username,dueDate:payload.due_date,priority:payload.priority}})})
      }
    }
    setSaving(false); close(); loadTasks()
  }

  const del = async t => { if (!confirm(`Delete "${t.title}"?`)) return; await supabase.from('tasks').delete().eq('id',t.id); loadTasks() }
  const statusChange = async (id,status) => { await supabase.from('tasks').update({status}).eq('id',id); loadTasks() }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isManage?'Manage Tasks':'My Tasks'}</h1>
          <p className="page-sub">{filtered.length} {filter==='active'?'active':filter==='done'?'completed':'total'} tasks</p>
        </div>
        {isManage && <button onClick={openAdd} className="btn btn-primary"><Plus size={14}/>New Task</button>}
      </div>

      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {['active','done','all'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`filter-pill${filter===f?' active':''}`} style={{textTransform:'capitalize'}}>{f==='active'?'Active':f==='done'?'Completed':'All'}</button>
        ))}
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div className="spin-center"><div className="spin"/></div> : filtered.length===0 ? (
          <div className="empty"><p>No {filter==='active'?'active':filter==='done'?'completed':''} tasks</p></div>
        ) : (
          <div>
            {isManage && (
              <div style={{display:'grid',gridTemplateColumns:'24px 1fr auto auto auto auto',gap:12,padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div/><span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--faint)'}}>Task</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--faint)'}}>Assigned</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--faint)'}}>Due</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--faint)'}}>Status</span>
                <div/>
              </div>
            )}
            {filtered.map(t=><TaskRow key={t.id} task={t} isManage={isManage} onEdit={openEdit} onDelete={del} onStatusChange={statusChange} me={me} />)}
          </div>
        )}
      </div>

      {modal && (
        <Modal title={editing?'Edit Task':'New Task'} onClose={close} footer={<><button onClick={close} className="btn btn-outline">Cancel</button><button onClick={save} disabled={saving} className="btn btn-primary">{saving?'Saving...':'Save'}</button></>}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><label className="inp-label">Title *</label><input className="inp" value={form.title} onChange={e=>u('title',e.target.value)} /></div>
            <div><label className="inp-label">Description</label><textarea className="inp" rows={3} value={form.description} onChange={e=>u('description',e.target.value)} style={{resize:'vertical'}} /></div>
            <div className="form-grid">
              <div><label className="inp-label">Assign To</label>
                <select className="inp" value={form.assigned_to_email} onChange={e=>{const usr=users.find(u=>u.userPrincipalName===e.target.value);u('assigned_to_email',e.target.value);u('assigned_to_name',usr?.displayName||'')}}>
                  <option value="">Select staff...</option>
                  {users.map(u=><option key={u.userPrincipalName} value={u.userPrincipalName}>{u.displayName}</option>)}
                </select>
              </div>
              <div><label className="inp-label">Due Date</label><input className="inp" type="date" value={form.due_date} onChange={e=>u('due_date',e.target.value)} /></div>
              <div><label className="inp-label">Priority</label>
                <select className="inp" value={form.priority} onChange={e=>u('priority',e.target.value)}>
                  {Object.entries(PRIORITY_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div><label className="inp-label">Status</label>
                <select className="inp" value={form.status} onChange={e=>u('status',e.target.value)}>
                  {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div></div>)}
      )}
    
  )
}
