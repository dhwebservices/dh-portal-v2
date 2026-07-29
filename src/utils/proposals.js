import { supabase } from './supabase'

export async function saveProposal(proposalData) {
  const { data, error } = await supabase
    .from('proposals')
    .insert([proposalData])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateProposal(id, updates) {
  const { data, error } = await supabase
    .from('proposals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getProposals(filters = {}) {
  let query = supabase.from('proposals').select('*').order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.client_email) query = query.eq('client_email', filters.client_email)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getProposal(id) {
  const { data, error} = await supabase
    .from('proposals')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}
