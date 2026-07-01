import { Link } from 'react-router-dom'
import { Crown, MoreVertical, UserMinus } from 'lucide-react'
import type { CompetitionMember as Member } from '../../types/competition'
import { avatarThumbUrl } from '../../lib/image/imageTransform'

export function MemberRow({
  member, isOwner, canModerate, isMe, menuOpen, busy, onOpenMenu, onPromote, onDemote, onKick,
}: {
  member: Member
  isOwner: boolean
  canModerate: boolean
  isMe: boolean
  menuOpen: boolean
  busy: boolean
  onOpenMenu: () => void
  onPromote: () => void
  onDemote: () => void
  onKick: () => void
}) {
  const displayName = member.user.name ?? `@${member.user.handle}`
  const isAdmin = member.role === 'ADMIN'
  // Owner is always admin. Can't kick self via this menu (use Leave instead).
  // Can't kick the owner. Demote requires another active admin available
  // — the backend also enforces this, but we hide the option when the user
  // is the only admin to avoid showing a button that always errors.
  const showPromote = canModerate && !isAdmin && !member.abandonedAt
  const showDemote = canModerate && isAdmin && !isOwner && !member.abandonedAt
  const showKick = canModerate && !isOwner && !isMe && !member.abandonedAt
  const hasAnyAction = showPromote || showDemote || showKick

  return (
    <li className="relative flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
      <Link
        to={`/u/${member.userId}`}
        className="flex shrink-0 items-center"
        aria-label={`Abrir perfil de ${displayName}`}
      >
        {member.user.avatarUrl ? (
          <img
            src={avatarThumbUrl(member.user.avatarUrl, 96)}
            alt={displayName}
            className={`h-10 w-10 shrink-0 rounded-full object-cover ${member.abandonedAt ? 'opacity-40 grayscale' : ''}`}
          />
        ) : (
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--text)] ${member.abandonedAt ? 'opacity-40' : ''}`}>
            {(member.user.name ?? member.user.handle).slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={`/u/${member.userId}`}
          className={`block truncate text-sm font-semibold hover:underline ${member.abandonedAt ? 'text-[var(--muted)] line-through' : 'text-[var(--text)]'}`}
        >
          {displayName}
        </Link>
        <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
          @{member.user.handle}
          {member.abandonedAt && ' · saiu'}
        </p>
      </div>

      {isAdmin && !member.abandonedAt && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <Crown size={10} />
          Admin
        </span>
      )}

      {hasAnyAction && (
        <div className="relative">
          <button
            type="button"
            onClick={onOpenMenu}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:opacity-50"
            aria-label="Ações do membro"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-xl">
              {showPromote && (
                <button
                  type="button"
                  onClick={onPromote}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <Crown size={12} className="text-amber-500" />
                  Promover a admin
                </button>
              )}
              {showDemote && (
                <button
                  type="button"
                  onClick={onDemote}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <UserMinus size={12} className="text-[var(--muted)]" />
                  Remover admin
                </button>
              )}
              {showKick && (
                <button
                  type="button"
                  onClick={onKick}
                  disabled={busy}
                  className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2 text-left text-xs font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <UserMinus size={12} />
                  Remover do desafio
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
