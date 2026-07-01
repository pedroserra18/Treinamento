import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — created once on first call, reused after. Returns
// null when the env isn't configured so callers can gracefully skip
// realtime and fall back to polling. Auth-less client: the anon key
// only grants what RLS lets it grant on the targeted tables.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let cached: SupabaseClient | null | undefined

export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    cached = null
    return null
  }
  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: {
      // Throttle log spam — broadcast every event at most once per ~100ms
      // even when the room is busy.
      params: { eventsPerSecond: 10 }
    }
  })
  return cached
}

export function isRealtimeEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
