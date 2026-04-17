import { supabase } from './supabase'

export async function logAction(userEmail, userName, action, target, targetId, details = {}) {
  try {
    await supabase.from('audit_log').insert([{
      user_email: userEmail,
      user_name: userName,
      action,
      target,
      target_id: targetId ? String(targetId) : null,
      details,
      created_at: new Date().toISOString(),
    }])
  } catch (e) {
    console.warn('Audit log failed:', e)
  }
}
