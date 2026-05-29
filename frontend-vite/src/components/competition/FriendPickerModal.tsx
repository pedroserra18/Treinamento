import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X as XIcon } from 'lucide-react'
import {
  useInvitableFriends,
  useInviteMember,
} from '../../hooks/useCompetition'
import { avatarThumbUrl } from '../../lib/imageTransform'

export function FriendPickerModal({
  competitionId, onClose, onInvited,
}: {
  competitionId: string
  onClose: () => void
  onInvited: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const query = useInvitableFriends(competitionId)
  const inviteMut = useInviteMember(competitionId)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const friends = useMemo(() => query.data?.items ?? [], [query.data])
  const loading = query.isLoading

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return friends
    return friends.filter(
      (f) => (f.name ?? '').toLowerCase().includes(q) || f.handle.toLowerCase().includes(q),
    )
  }, [friends, search])

  const handleInvite = async (friendId: string) => {
    setInviting(friendId)
    setError(null)
    try {
      await inviteMut.mutateAsync({ invitedUserId: friendId })
      onInvited()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao convidar')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] sm:rounded-2xl sm:border-b"
        style={{ maxHeight: 'min(85vh, 720px)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-extrabold text-[var(--text)]">Convidar amigo</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label="Fechar"
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou @handle"
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10.5px] text-[var(--muted)]">
            Apenas amigos (segue mútuo) aparecem aqui.
          </p>
        </div>

        {error && (
          <p className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
              {friends.length === 0
                ? 'Sem amigos disponíveis. Seus amigos precisam ter aceitado o seu seguir.'
                : 'Nenhum amigo bate com a busca.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((f) => {
                const isInviting = inviting === f.id
                return (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] p-2.5"
                  >
                    {f.avatarUrl ? (
                      <img
                        src={avatarThumbUrl(f.avatarUrl, 80)}
                        alt={f.name ?? f.handle}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xs font-bold text-[var(--text)]">
                        {(f.name ?? f.handle).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {f.name ?? `@${f.handle}`}
                      </p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">@{f.handle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleInvite(f.id)}
                      disabled={isInviting}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
                    >
                      {isInviting ? 'Enviando…' : 'Convidar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}
