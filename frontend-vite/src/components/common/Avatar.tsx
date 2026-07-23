import { avatarColorFromId, avatarInitials } from './feed-post-utils'

// Avatar circular com gradiente + iniciais (fallback) e indicador decorativo
// de "online". Reutilizado no feed, comentários e cabeçalhos de perfil.
export function Avatar({ userId, name, handle, avatarUrl, size = 44, onClick }: {
  userId: string
  name: string | null
  handle: string
  avatarUrl: string | null | undefined
  size?: number
  onClick?: () => void
}) {
  const color = avatarColorFromId(userId)
  const initials = avatarInitials(name, handle)
  const inner = avatarUrl
    ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    : <span className="text-sm font-bold text-white" style={{ fontSize: size * 0.32 }}>{initials}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative shrink-0 overflow-visible rounded-full disabled:cursor-default"
      style={{ width: size, height: size }}
      aria-label={`Perfil de ${name ?? handle}`}
    >
      <span
        className="grid h-full w-full place-items-center overflow-hidden rounded-full"
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}aa 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px -6px ${color}80`,
        }}
      >
        {inner}
      </span>
      {/* Decorative online indicator — no real presence backend yet. */}
      <span
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--surface)]"
        style={{ width: size * 0.27, height: size * 0.27, background: '#34C759' }}
      />
    </button>
  )
}
