import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { competitionKeys } from './useCompetition'
import { getSupabaseClient, isRealtimeEnabled } from '../lib/infra/supabaseClient'

// Subscribes to Postgres changes on the tables that drive the detail
// page (entries, reactions, comments, messages) filtered by the current
// competition. Each event invalidates the relevant React Query cache
// keys so the next render reads fresh data — much cheaper than polling
// every 12s.
//
// Falls back silently to no-op when VITE_SUPABASE_URL / ANON_KEY are
// not configured (the existing polling stays in effect). To enable in
// production:
//   1. Set the two env vars in the frontend deploy.
//   2. In the Supabase dashboard → Database → Replication, switch ON
//      the public.competition_entries, competition_entry_reactions,
//      competition_entry_comments, and competition_messages tables.
//   3. Ensure RLS policies permit the anon role to SELECT those rows
//      for users that belong to the competition. (No write access via
//      Realtime — all writes still go through the API.)
//
// The hook returns whether realtime is enabled so the page can dial
// polling intervals back when it is.
export function useCompetitionRealtime(competitionId: string | undefined): { enabled: boolean } {
  const qc = useQueryClient()

  useEffect(() => {
    if (!competitionId) return
    const client = getSupabaseClient()
    if (!client) return

    const channel = client
      .channel(`competition:${competitionId}`)
      // Any change on competition_entries for this room → refresh feed
      // + standings (standings depend on entries via the pre-aggregated
      // stats which are bumped by the API). Filter is on competition_id
      // so we don't receive events for other rooms.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competition_entries', filter: `competitionId=eq.${competitionId}` },
        () => {
          void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
          void qc.invalidateQueries({ queryKey: competitionKeys.standings(competitionId) })
        },
      )
      // Reactions don't change standings but they bump the chip on the
      // grid tile — invalidate feed only.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competition_entry_reactions' },
        () => {
          void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
        },
      )
      // Same for comments — bumps commentsCount on the tile and the
      // open thread refetches via its own query.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competition_entry_comments' },
        () => {
          void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
        },
      )
      // Chat: invalidating the chat key triggers a refetch in the
      // CompetitionChat component without it knowing about realtime.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'competition_messages', filter: `competitionId=eq.${competitionId}` },
        () => {
          void qc.invalidateQueries({ queryKey: competitionKeys.chat(competitionId) })
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [competitionId, qc])

  return { enabled: isRealtimeEnabled() }
}
