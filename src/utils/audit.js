import { supabase } from './supabase'

export async function logAction(userEmail, userName, action, entity, entityId = null, details = null) {
  try {
    await supabase.from('audit_log').insert([{
      user_email: userEmail,
      user_name:  userName,
      action,
      entity,
      entity_id:  entityId ? String(entityId) : null,
      details,
    }])

    // Create notification for key actions
    const notifyActions = ['client_onboarded', 'commission_paid', 'support_reply', 'invoice_added', 'status_updated']
    if (notifyActions.includes(action)) {
      await supabase.from('notifications').insert([{
        user_email: null,
        title:      formatNotification(action, entity, details),
        message:    details?.message || null,
        type:       'info',
        link:       getLink(action),
      }])
    }
  } catch (e) {
    console.error('Audit log error:', e)
  }
}

function formatNotification(action, entity, details) {
  const map = {
    client_onboarded: `New client onboarded: ${details?.name || entity}`,
    commission_paid:  `Commission paid: £${details?.amount || ''} to ${details?.staff || ''}`,
    support_reply:    `Support query replied: ${details?.subject || ''}`,
    invoice_added:    `Invoice added for ${details?.client || entity}`,
    status_updated:   `Website status updated: ${details?.status || ''}`,
  }
  return map[action] || `${action.replace(/_/g, ' ')} — ${entity}`
}

function getLink(action) {
  const map = {
    client_onboarded: '/clients',
    commission_paid:  '/staff',
    support_reply:    '/client-mgmt',
    invoice_added:    '/client-mgmt',
    status_updated:   '/client-mgmt',
  }
  return map[action] || '/dashboard'
}

export async function registerSession(userEmail, userName) {
  try {
    await supabase.from('active_sessions').delete().eq('user_email', userEmail)
    await supabase.from('active_sessions').insert([{
      user_email:  userEmail,
      user_name:   userName,
      user_agent:  navigator.userAgent,
      logged_in_at: new Date().toISOString(),
      last_seen:   new Date().toISOString(),
    }])
    // Log the login action
    await logAction(userEmail, userName, 'user_login', 'session', null, { browser: navigator.userAgent.split(')')[0].split('(')[1] })
  } catch (e) {
    console.error('Session register error:', e)
  }
}

export async function updateSession(userEmail) {
  try {
    await supabase.from('active_sessions')
      .update({ last_seen: new Date().toISOString() })
      .eq('user_email', userEmail)
  } catch (e) {}
}
