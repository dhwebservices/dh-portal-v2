import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Button, StatusBadge, FormSelect } from '../components/ds'
import SubNav from '../components/SubNav'
import { sendManagedNotification } from '../utils/notificationPreferences'

export default function MyTasks() {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const canManageTasks = can('tasks')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user?.email) return
    loadTasks()
  }, [user?.email])

  async function loadTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .ilike('assigned_to_email', user.email)
      .order('due_date')
    setTasks(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))

    // Notify task creator
    const task = tasks.find(t => t.id === id)
    if (task?.assigned_by_email && task.assigned_by_email !== user?.email) {
      await sendManagedNotification({
        userEmail: task.assigned_by_email,
        title: 'Task updated: ' + task.title,
        message: (user?.name || user?.email) + ' changed status to ' + status.replace('_', ' '),
        link: '/my-tasks',
        type: status === 'done' ? 'success' : 'info',
        category: 'tasks',
        sentBy: user?.name || user?.email,
      }).catch(() => {})
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (filter === 'open') return t.status !== 'done'
    if (filter === 'done') return t.status === 'done'
    return true
  })

  const openCount = tasks.filter(t => t.status !== 'done').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  if (loading) {
    return (
      <div className="ds-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          Loading tasks...
        </div>
      </div>
    )
  }

  return (
    <div className="ds-content">
      {/* Page Header */}
      <div className="ds-page-header">
        <div>
          <h1>My Tasks</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {openCount} open · {doneCount} completed
          </p>
        </div>
      </div>

      {/* Sub Navigation */}
      <SubNav items={[
        { label: 'My Tasks', active: true, onClick: () => {} },
        canManageTasks && { label: 'Manage Tasks', onClick: () => navigate('/tasks') },
        can('schedule') && { label: 'Schedule', onClick: () => navigate('/schedule') },
        can('hr_leave') && { label: 'My Leave', onClick: () => navigate('/hr/leave') },
        can('hr_payslips') && { label: 'My Payslips', onClick: () => navigate('/hr/payslips') },
      ]} />

      {/* Filter */}
      <div style={{
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        padding: 'var(--space-md)',
        marginBottom: 'var(--space-lg)',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <FormSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '200px' }}
        >
          <option value="all">All Tasks</option>
          <option value="open">Open Only</option>
          <option value="done">Completed Only</option>
        </FormSelect>
        <div style={{
          marginLeft: 'auto',
          fontSize: '13px',
          color: 'var(--color-text-secondary)'
        }}>
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-lg)',
          padding: 'var(--space-3xl)',
          textAlign: 'center',
          color: 'var(--color-text-secondary)'
        }}>
          No tasks {filter !== 'all' ? `(${filter})` : 'assigned to you'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {filteredTasks.map(task => {
            const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
            const priorityColors = {
              low: { bg: 'var(--color-gray-100)', color: 'var(--color-gray-600)' },
              medium: { bg: '#DBEAFE', color: '#1E40AF' },
              high: { bg: '#FEF3C7', color: '#92400E' },
              urgent: { bg: '#FEE2E2', color: '#991B1B' }
            }
            const priorityColor = priorityColors[task.priority] || priorityColors.low

            return (
              <div
                key={task.id}
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  borderLeft: `4px solid ${task.status === 'done' ? '#10B981' : priorityColor.color}`,
                  borderRadius: 'var(--border-radius-lg)',
                  padding: 'var(--space-md) var(--space-lg)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: 500,
                      color: task.status === 'done' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      marginBottom: '4px'
                    }}>
                      {task.title}
                    </div>
                    {task.description && (
                      <div style={{
                        fontSize: '13px',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-sm)'
                      }}>
                        {task.description}
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      gap: 'var(--space-sm)',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginTop: 'var(--space-sm)'
                    }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--border-radius-sm)',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: priorityColor.bg,
                        color: priorityColor.color,
                        textTransform: 'uppercase'
                      }}>
                        {task.priority}
                      </span>
                      {task.due_date && (
                        <span style={{
                          fontSize: '12px',
                          color: overdue ? '#EF4444' : 'var(--color-text-secondary)',
                          fontWeight: overdue ? 500 : 400
                        }}>
                          {overdue && '⚠️ '}Due: {new Date(task.due_date).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {task.assigned_by_name && (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          from {task.assigned_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <FormSelect
                    value={task.status}
                    onChange={(e) => updateStatus(task.id, e.target.value)}
                    style={{
                      width: '140px',
                      fontSize: '13px',
                      flexShrink: 0
                    }}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </FormSelect>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
