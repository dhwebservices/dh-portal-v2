import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sendManagedNotification } from '../utils/notificationPreferences'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const STATUSES  = ['todo','in_progress','done']
const prioColor = { low:'var(--sub)', medium:'var(--accent)', high:'var(--amber,#f59e0b)', urgent:'var(--red)' }
const prioBg    = { low:'var(--bg2)', medium:'var(--accent-soft)', high:'#fef3c7', urgent:'#fee2e2' }

export default function MyTasks() {
  const { user } = useAuth()
  const [tasks,  setTasks]  = useState([])
  const [loading,setLoading]= useState(true)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!user?.email) return
    let mounted = true
    supabase.from('tasks').select('*').ilike('assigned_to_email', user.email).order('due_date')
      .then(({ data }) => { if (mounted) { setTasks(data || []); setLoading(false) } })
    return () => { mounted = false }
  }, [user?.email])

  const updateStatus = async (id, status) => {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    if (detail?.id === id) setDetail(p => ({ ...p, status }))
    // Notify task creator
    const task = tasks.find(t => t.id === id)
    if (task?.created_by && task.assigned_by_email !== user?.email) {
      await sendManagedNotification({
        userEmail: task.assigned_by_email,
        title: 'Task updated: ' + task.title,
        message: (user?.name || user?.email) + ' changed status to ' + status.replace('_', ' '),
        link: '/tasks',
        type: status === 'done' ? 'success' : 'info',
        category: 'tasks',
        sentBy: user?.name || user?.email,
      }).catch(() => {})
    }
  }

  const open = tasks.filter(t => t.status !== 'done')
  const done = tasks.filter(t => t.status === 'done')

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">My Tasks</h1><p className="page-sub">{open.length} open · {done.length} completed</p></div>
      </div>

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
        <>
          {open.length === 0 && done.length === 0 && (
            <div className="card card-pad" style={{ textAlign:'center', color:'var(--faint)', padding:48 }}>No tasks assigned to you</div>
          )}

          {open.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Open</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {open.map(t => <TaskCard key={t.id} task={t} user={user} onOpen={() => setDetail(t)} onStatus={updateStatus}/>)}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Completed</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {done.map(t => <TaskCard key={t.id} task={t} user={user} onOpen={() => setDetail(t)} onStatus={updateStatus}/>)}
              </div>
            </div>
          )}
        </>
      )}

      {detail && (
        <TaskDetail task={detail} user={user} onClose={() => setDetail(null)} onStatusChange={updateStatus}/>
      )}
    </div>
  )
}

function TaskCard({ task, user, onOpen, onStatus }) {
  const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
  return (
    <div className="card" style={{ padding:'14px 18px', cursor:'pointer', borderLeft:'3px solid ' + (task.status==='done' ? 'var(--green,#22c55e)' : prioColor[task.priority]) }} onClick={onOpen}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:500, color: task.status==='done' ? 'var(--faint)' : 'var(--text)', textDecoration: task.status==='done' ? 'line-through' : 'none', marginBottom:4 }}>{task.title}</div>
          {task.description && <div style={{ fontSize:12, color:'var(--faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:340 }}>{task.description}</div>}
          <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:600, background: prioBg[task.priority], color: prioColor[task.priority] }}>{task.priority}</span>
            {task.due_date && <span style={{ fontSize:11, color: overdue ? 'var(--red)' : 'var(--faint)', fontFamily:'var(--font-mono)' }}>{overdue ? '⚠ Overdue · ' : ''}{new Date(task.due_date).toLocaleDateString('en-GB')}</span>}
            {task.assigned_by_email_name && <span style={{ fontSize:11, color:'var(--faint)' }}>from {task.assigned_by_email_name}</span>}
          </div>
        </div>
        <select className="inp" style={{ padding:'4px 8px', fontSize:12, width:'auto', flexShrink:0 }} value={task.status}
          onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); onStatus(task.id, e.target.value) }}>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
      </div>
    </div>
  )
}

function TaskDetail({ task, user, onClose, onStatusChange }) {
  const [comments, setComments] = useState([])
  const [comment,  setComment]  = useState('')
  const [posting,  setPosting]  = useState(false)
  const [status,   setStatus]   = useState(task.status)
  const endRef = useRef()

  useEffect(() => { loadComments() }, [task.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [comments])

  const loadComments = async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at')
    setComments(data || [])
  }

  const changeStatus = async (s) => {
    setStatus(s)
    await onStatusChange(task.id, s)
    if (task.assigned_by_email && task.assigned_by_email !== user?.email) {
      await sendManagedNotification({
        userEmail: task.assigned_by_email,
        title: 'Task status updated: ' + task.title,
        message: (user?.name || user?.email) + ' changed status to ' + s.replace('_', ' '),
        link: '/tasks',
        type: s === 'done' ? 'success' : 'info',
        category: 'tasks',
        sentBy: user?.name || user?.email,
      }).catch(() => {})
    }
  }

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    const { error } = await supabase.from('task_comments').insert([{
      task_id: task.id, user_email: user?.email, user_name: user?.name || user?.email,
      body: comment.trim(), created_at: new Date().toISOString(),
    }])
    if (!error) {
      if (task.assigned_by_email && task.assigned_by_email !== user?.email) {
        await sendManagedNotification({
          userEmail: task.assigned_by_email,
          title: '💬 Comment on: ' + task.title,
          message: (user?.name || user?.email) + ': ' + comment.trim().slice(0, 80),
          link: '/tasks',
          type: 'info',
          category: 'tasks',
          emailSubject: '💬 New comment on: ' + task.title,
          emailHtml: '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px"><h2>New Comment</h2><p><strong>' + (user?.name||user?.email) + '</strong> commented on <strong>' + task.title + '</strong>:</p><div style="background:#F9FAFB;border-left:3px solid #1A1612;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">' + comment.trim() + '</div><a href="' + PORTAL_URL + '/tasks" style="display:inline-block;background:#1A1612;color:#fff;padding:11px 22px;border-radius:7px;text-decoration:none;font-size:13px">View Task →</a></div>',
          sentBy: user?.name || user?.email,
          portalUrl: PORTAL_URL,
        }).catch(() => {})
      }
      setComment('')
      loadComments()
    }
    setPosting(false)
  }

  const statusColor = { todo:'var(--sub)', in_progress:'var(--accent)', done:'var(--green,#22c55e)' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div style={{ position:'relative', width:520, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:6, lineHeight:1.3 }}>{task.title}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ padding:'3px 10px', borderRadius:5, fontSize:11, fontWeight:600, background: prioBg[task.priority], color: prioColor[task.priority] }}>{task.priority}</span>
              {task.due_date && <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Due {new Date(task.due_date).toLocaleDateString('en-GB')}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>
        <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'var(--faint)', marginRight:4 }}>Status:</span>
          {STATUSES.map(s => (
            <button key={s} onClick={() => changeStatus(s)}
              style={{ padding:'6px 14px', borderRadius:7, border:'1px solid '+(status===s?statusColor[s]:'var(--border)'), background:status===s?(s==='done'?'#dcfce7':s==='in_progress'?'var(--accent-soft)':'var(--bg2)'):'transparent', color:status===s?statusColor[s]:'var(--sub)', cursor:'pointer', fontSize:12, fontWeight:status===s?600:400, transition:'all 0.15s' }}>
              {s==='in_progress'?'In Progress':s==='done'?'✓ Done':'To Do'}
            </button>
          ))}
        </div>
        {task.description && (
          <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Description</div>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{task.description}</div>
          </div>
        )}
        <div style={{ flex:1, padding:'16px 24px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Comments {comments.length>0&&'('+comments.length+')'}</div>
          {comments.length===0 && <div style={{ fontSize:13, color:'var(--faint)', textAlign:'center', padding:'24px 0' }}>No comments yet</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display:'flex', gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
                {(c.user_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1, background:'var(--bg2)', borderRadius:10, padding:'10px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.user_name||c.user_email}</span>
                  <span style={{ fontSize:11, color:'var(--faint)' }}>{new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.body}</div>
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
          <textarea className="inp" rows={2} value={comment} onChange={e=>setComment(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))postComment()}}
            placeholder="Add a comment... (Cmd+Enter to send)" style={{ flex:1, resize:'none', fontSize:13 }}/>
          <button className="btn btn-primary" onClick={postComment} disabled={posting||!comment.trim()} style={{ alignSelf:'flex-end' }}>
            {posting?'...':'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
