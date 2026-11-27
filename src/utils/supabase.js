import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { authHeaders } from './authHeaders'
import { getStaffIdToken } from './staffToken'

/**
 * The database, reached through the portal's own /sb route (functions/sb).
 *
 * That route checks the caller's Microsoft sign-in and only then forwards to
 * Supabase with the server key, so the tables no longer have to be open to
 * the public anon key. Every request carries the signed-in person's ID token.
 */
const PORTAL_ORIGIN = 'https://staff.dhwebsiteservices.co.uk'
export const SUPABASE_PROXY = Capacitor.isNativePlatform()
  ? `${PORTAL_ORIGIN}/sb`
  : `${window.location.origin}/sb`

// supabase-js insists on a key; the /sb route ignores it.
const PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'

async function staffToken() {
  if (Capacitor.isNativePlatform()) {
    try { return await getStaffIdToken() } catch { return '' }
  }
  const headers = await authHeaders()
  return (headers.Authorization || '').replace(/^Bearer /, '')
}

export async function proxiedFetch(input, init = {}) {
  const token = await staffToken()
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  headers.delete('apikey')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  else headers.delete('Authorization')
  return fetch(input, { ...init, headers })
}

/** fetch() for a raw REST path such as `/rest/v1/client_invoices?id=eq.1`. */
export function sbFetch(path, init = {}) {
  return proxiedFetch(`${SUPABASE_PROXY}${path}`, init)
}

export const supabase = createClient(SUPABASE_PROXY, PUBLIC_KEY, {
  global: { fetch: proxiedFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
