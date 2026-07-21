import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X as XIcon } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { type UserSearchResult } from '../../services/socialService'

// Modal de seguidores/seguindo (mantido enxuto).
export function UserListModal({
  title, users, onClose, onNavigate,
}: {
  title: string
  users: UserSearchResult[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)]"><XIcon size={16} /></button>
        </div>
        <div className="flex-1 divide-y divide-[var(--line)] overflow-y-auto overflow-x-hidden overscroll-contain">
          {users.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Nenhum usuário aqui ainda.</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onClose(); onNavigate(u.id) }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)]">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>}
              </div>
              <span className="truncate text-sm font-semibold text-[var(--text)]">{u.name ?? 'Usuário'}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
