import { supabase } from './supabase'

/**
 * Get leave balance for a user
 * Replaces getXeroLeaveBalance - now reads from Supabase leave_balances table
 */
export async function getLeaveBalance(userEmail) {
  try {
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_email', userEmail)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    // Return balance or defaults if not found
    return data || {
      annual: 25,
      sick: 10,
      annual_remaining: 25,
      sick_remaining: 10,
    }
  } catch (err) {
    console.error('Failed to fetch leave balance:', err)
    return {
      annual: 25,
      sick: 10,
      annual_remaining: 25,
      sick_remaining: 10,
    }
  }
}
