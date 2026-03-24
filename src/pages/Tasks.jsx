import { useState, useEffect, useRef } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { StaffPicker } from '../components/StaffPicker'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'
const EMPTY  = { title:'', description:'', assigned_to_email:'', assigned_to_name:'', due_date:'', priority:'medium', status:'todo' }
const PRIORITIES = ['low','medium','high','urgent']
const STATUSES   = ['todo','in_progress','done']
const prioColor  = { low:'var(--sub)', medium:'var(--accent)', high:'var(--amber,#f59e0b)', urgent:'var(--red)' }
const prioBg     = { low:'var(--bg2)', medium:'var(--accent-soft)', high:'#fef3c7', urgent:'#fee2e2' }

// ── helper: push a portal notification ───────────────────────────────
async function notify(user_email, title, message, link, type = 'info') {
  try {
    await supabase.from('notifications').insert([{
      user_email, title, message, type, link, read: false, created_at: new Date().toISOString()
    }])
  } catch (e) { /* ignore */ }
}

// ── helper: send email via worker ─────────────────────────────────────
function sendEmail(to, subject, html) {
  fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'send_email', data: { to, subject, html, from_name: 'DH Website Services — Client Services', from_email: 'clients@dhwebsiteservices.co.uk' } })
  }).catch(() => {})
}

export default function Tasks() {
  const { user } = useAuth()
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('all')
  const [modal,   setModal]   = useState(false)
  const [detail,  setDetail]  = useState(null) // task detail view
  const [editing, setEditing] = useState(null)
  const [form,    setForm]    = useState(EMPTY)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (error) console.error('Tasks load error:', error)
    setTasks(data || [])
    setLoading(false)
  }

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = t  => { setEditing(t); setForm({ ...t }); setModal(true) }
  const close    = () => { setModal(false); setEditing(null) }
  const sf       = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.title) return
    setSaving(true)
    if (editing) {
      const { error } = await supabase.from('tasks').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) console.error('Task update error:', error)
    } else {
      const { data: inserted, error } = await supabase.from('tasks').insert([{
        title: form.title,
        description: form.description || '',
        assigned_to_email: form.assigned_to_email || null,
        assigned_to_name: form.assigned_to_name || null,
        due_date: form.due_date || null,
        priority: form.priority || 'medium',
        status: form.status || 'todo',
        assigned_by_email: user?.email,
        assigned_by_name: user?.name,
        created_at: new Date().toISOString(),
      }]).select()

      if (error) {
        console.error('Task insert error:', error)
        setSaving(false)
        return
      }

      const taskId = inserted?.[0]?.id

      // Notify + email assigned person
      if (form.assigned_to_email) {
        await notify(
          form.assigned_to_email,
          '📋 New task assigned: ' + form.title,
          'Assigned by ' + (user?.name || user?.email) + (form.due_date ? ' · Due ' + form.due_date : ''),
          '/my-tasks',
          'info'
        )
        sendEmail(
          form.assigned_to_email,
          '📋 New Task Assigned: ' + form.title,
          '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">' +
          '<h2 style="color:#1A1612;margin-bottom:4px">New Task Assigned</h2>' +
          '<p style="color:#6b7280;margin-bottom:24px">Hi ' + (form.assigned_to_name || form.assigned_to_email) + ',</p>' +
          '<p>You have been assigned a new task by <strong>' + (user?.name || user?.email) + '</strong>.</p>' +
          '<table style="width:100%;border-collapse:collapse;margin:20px 0">' +
          [['Task', form.title], ['Priority', form.priority], ['Due Date', form.due_date || '—'], ['Description', form.description || '—']]
            .map(([l, v]) => '<tr><td style="padding:10px 14px;background:#F9FAFB;border:1px solid #E5E7EB;font-weight:600;width:100px;font-size:13px">' + l + '</td><td style="padding:10px 14px;border:1px solid #E5E7EB;font-size:13px">' + v + '</td></tr>').join('') +
          '</table>' +
          '<a href="https://staffdev.dhwebsiteservices.co.uk/my-tasks" style="display:inline-block;background:#1A1612;color:#fff;padding:11px 22px;border-radius:7px;text-decoration:none;font-size:13px;margin-top:8px">View My Tasks →</a>' +
          '</div>'
        )
      }
    }
    setSaving(false)
    close()
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', id)
    load()
  }

  const updateStatus = async (id, status) => {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    if (detail?.id === id) setDetail(p => ({ ...p, status }))
  }

  const filtered = tasks.filter(t => {
    const q = search.toLowerCase()
    const matchQ = !q || t.title?.toLowerCase().includes(q) || t.assigned_to_name?.toLowerCase().includes(q)
    const matchF = filter === 'all' || t.status === filter || (filter === 'mine' && t.assigned_to_email === user?.email)
    return matchQ && matchF
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Manage Tasks</h1>
          <p className="page-sub">{tasks.filter(t => t.status !== 'done').length} open tasks</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ New Task</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <svg style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--faint)',pointerEvents:'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input className="inp" style={{ paddingLeft:34 }} placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['all','All'],['todo','To Do'],['in_progress','In Progress'],['done','Done'],['mine','Mine']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)} className={'pill'+(filter===v?' on':'')}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> : (
          <table className="tbl">
            <thead><tr><th>Task</th><th>Assigned To</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ cursor:'pointer' }} onClick={() => setDetail(t)}>
                  <td className="t-main" style={{ maxWidth:280 }}>
                    <div style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                    {t.description && <div style={{ fontSize:11, color:'var(--faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 }}>{t.description}</div>}
                  </td>
                  <td>
                    {t.assigned_to_name ? (
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ width:20, height:20, borderRadius:'50%', background:'var(--accent-soft)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
                          {t.assigned_to_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                        </span>
                        {t.assigned_to_name}
                      </span>
                    ) : <span style={{ color:'var(--faint)' }}>Unassigned</span>}
                  </td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('en-GB') : '—'}</td>
                  <td><span style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600, background: prioBg[t.priority], color: prioColor[t.priority] }}>{t.priority}</span></td>
                  <td>
                    <select className="inp" style={{ padding:'4px 8px', fontSize:12, width:'auto' }} value={t.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); updateStatus(t.id, e.target.value) }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'var(--faint)' }}>No tasks found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Task Detail Modal */}
      {detail && (
        <TaskDetail
          task={detail}
          user={user}
          onClose={() => setDetail(null)}
          onStatusChange={updateStatus}
          onEdit={() => { openEdit(detail); setDetail(null) }}
        />
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={editing ? 'Edit Task' : 'New Task'} onClose={close}
          footer={<><button className="btn btn-outline" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Task'}</button></>}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div><label className="lbl">Title *</label><input className="inp" value={form.title} onChange={e=>sf('title',e.target.value)} placeholder="Task title"/></div>
            <div><label className="lbl">Description</label><textarea className="inp" rows={3} value={form.description} onChange={e=>sf('description',e.target.value)} style={{ resize:'vertical' }} placeholder="Optional details..."/></div>
            <StaffPicker label="Assign To" value={form.assigned_to_email}
              onChange={({ email, name }) => { sf('assigned_to_email', email); sf('assigned_to_name', name) }}
              placeholder="Select a staff member..."/>
            <div className="fg">
              <div><label className="lbl">Due Date</label><input className="inp" type="date" value={form.due_date} onChange={e=>sf('due_date',e.target.value)}/></div>
              <div><label className="lbl">Priority</label>
                <select className="inp" value={form.priority} onChange={e=>sf('priority',e.target.value)}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Task Detail Panel ─────────────────────────────────────────────────
function TaskDetail({ task, user, onClose, onStatusChange, onEdit }) {
  const [comments, setComments] = useState([])
  const [comment,  setComment]  = useState('')
  const [posting,  setPosting]  = useState(false)
  const [status,   setStatus]   = useState(task.status)
  const endRef = useRef()

  useEffect(() => { loadComments() }, [task.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [comments])

  const loadComments = async () => {
    const { data } = await supabase.from('task_comments')
      .select('*').eq('task_id', task.id).order('created_at')
    setComments(data || [])
  }

  const changeStatus = async (s) => {
    setStatus(s)
    await onStatusChange(task.id, s)
    // Notify task creator
    if (task.assigned_by_email && task.assigned_by_email !== user?.email) {
      await notify(
        task.assigned_by_email,
        'Task status updated: ' + task.title,
        (user?.name || user?.email) + ' changed status to ' + s.replace('_',' '),
        '/tasks',
        s === 'done' ? 'success' : 'info'
      )
    }
  }

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    const { error } = await supabase.from('task_comments').insert([{
      task_id: task.id,
      user_email: user?.email,
      user_name: user?.name || user?.email,
      body: comment.trim(),
      created_at: new Date().toISOString(),
    }])
    if (!error) {
      // Notify + email task creator if commenter is not the creator
      if (task.assigned_by_email && task.assigned_by_email !== user?.email) {
        await notify(
          task.assigned_by_email,
          '💬 New comment on: ' + task.title,
          (user?.name || user?.email) + ': ' + comment.trim().slice(0, 80),
          '/tasks',
          'info'
        )
        sendEmail(
          task.assigned_by_email,
          '💬 New comment on task: ' + task.title,
          '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">' +
          '<h2 style="color:#1A1612">New Comment on Task</h2>' +
          '<p><strong>' + (user?.name || user?.email) + '</strong> commented on <strong>' + task.title + '</strong>:</p>' +
          '<div style="background:#F9FAFB;border-left:3px solid #1A1612;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;font-size:14px">' + comment.trim() + '</div>' +
          '<a href="https://staffdev.dhwebsiteservices.co.uk/tasks" style="display:inline-block;background:#1A1612;color:#fff;padding:11px 22px;border-radius:7px;text-decoration:none;font-size:13px">View Task →</a>' +
          '</div>'
        )
      }
      // Also notify assigned person if they're not the commenter or creator
      if (task.assigned_to_email && task.assigned_to_email !== user?.email && task.assigned_to_email !== task.assigned_by_email) {
        await notify(
          task.assigned_to_email,
          '💬 New comment on: ' + task.title,
          (user?.name || user?.email) + ': ' + comment.trim().slice(0, 80),
          '/my-tasks',
          'info'
        )
      }
      setComment('')
      loadComments()
    }
    setPosting(false)
  }

  const statusColor = { todo: 'var(--sub)', in_progress: 'var(--accent)', done: 'var(--green,#22c55e)' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)' }}/>
      <div style={{ position:'relative', width:520, maxWidth:'95vw', height:'100vh', background:'var(--card)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, alignItems:'flex-start' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:600, color:'var(--text)', marginBottom:6, lineHeight:1.3 }}>{task.title}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ padding:'3px 10px', borderRadius:5, fontSize:11, fontWeight:600, background: prioBg[task.priority], color: prioColor[task.priority] }}>{task.priority}</span>
              {task.due_date && <span style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>Due {new Date(task.due_date).toLocaleDateString('en-GB')}</span>}
              {task.assigned_to_name && <span style={{ fontSize:11, color:'var(--sub)' }}>→ {task.assigned_to_name}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:20, lineHeight:1, padding:4 }}>×</button>
        </div>

        {/* Status selector */}
        <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'var(--faint)', marginRight:4 }}>Status:</span>
          {STATUSES.map(s => (
            <button key={s} onClick={() => changeStatus(s)}
              style={{ padding:'6px 14px', borderRadius:7, border:'1px solid ' + (status===s ? statusColor[s] : 'var(--border)'), background: status===s ? (s==='done'?'#dcfce7':s==='in_progress'?'var(--accent-soft)':'var(--bg2)') : 'transparent', color: status===s ? statusColor[s] : 'var(--sub)', cursor:'pointer', fontSize:12, fontWeight: status===s ? 600 : 400, transition:'all 0.15s' }}>
              {s === 'in_progress' ? 'In Progress' : s === 'done' ? '✓ Done' : 'To Do'}
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={onEdit}>Edit</button>
        </div>

        {/* Description */}
        {task.description && (
          <div style={{ padding:'16px 24px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Description</div>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{task.description}</div>
          </div>
        )}

        {/* Comments */}
        <div style={{ flex:1, padding:'16px 24px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
            Comments {comments.length > 0 && '(' + comments.length + ')'}
          </div>
          {comments.length === 0 && (
            <div style={{ fontSize:13, color:'var(--faint)', textAlign:'center', padding:'24px 0' }}>No comments yet</div>
          )}
          {comments.map(c => (
            <div key={c.id} style={{ display:'flex', gap:10 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600, color:'var(--accent)', flexShrink:0 }}>
                {(c.user_name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1, background:'var(--bg2)', borderRadius:10, padding:'10px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.user_name || c.user_email}</span>
                  <span style={{ fontSize:11, color:'var(--faint)' }}>{new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.body}</div>
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>

        {/* Comment input */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
          <textarea className="inp" rows={2} value={comment} onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) postComment() }}
            placeholder="Add a comment... (Cmd+Enter to send)" style={{ flex:1, resize:'none', fontSize:13 }}/>
          <button className="btn btn-primary" onClick={postComment} disabled={posting || !comment.trim()}
            style={{ alignSelf:'flex-end', whiteSpace:'nowrap' }}>
            {posting ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
