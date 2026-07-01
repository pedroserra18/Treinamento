import { Activity, Dumbbell, Image as ImageIcon, MessageCircle } from 'lucide-react'
import type {
  CompetitionFeedItem,
  CompetitionReactionKind,
} from '../../types/competition'
import { avatarThumbUrl, feedTileThumbUrl } from '../../lib/image/imageTransform'
import { ReactionsBar } from './ReactionsBar'
import { REACTION_KINDS } from './reactionKinds'

export function CompetitionFeed({
  items, onZoom, onReact,
}: {
  items: CompetitionFeedItem[]
  onZoom: (item: CompetitionFeedItem) => void
  onReact: (entryId: string, kind: CompetitionReactionKind) => void
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        <ImageIcon size={14} className="text-[var(--brand)]" />
        Feed de provas
      </h2>
      {items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-hover)] px-3 py-10 text-center">
          <ImageIcon size={32} className="mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-sm font-semibold text-[var(--text)]">Sem provas ainda</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Quando alguém terminar um treino e mandar a foto, ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2 lg:grid-cols-4">
          {items.map((item) => (
            <FeedGridTile
              key={item.id}
              item={item}
              onZoom={() => onZoom(item)}
              onReact={(kind) => onReact(item.id, kind)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FeedGridTile({
  item, onZoom, onReact,
}: {
  item: CompetitionFeedItem
  onZoom: () => void
  onReact: (kind: CompetitionReactionKind) => void
}) {
  const displayName = item.user.name ?? `@${item.user.handle}`
  const dayShort = new Date(item.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const totalReactions = item.reactions.reduce((sum, r) => sum + r.count, 0)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onZoom}
        className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
        aria-label={`Prova de ${displayName} em ${dayShort}`}
      >
        <img
          src={feedTileThumbUrl(item.photoUrl)}
          alt={`prova ${displayName}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <span
          className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold text-white backdrop-blur-sm"
          aria-hidden
        >
          {item.kind === 'TRAINING' ? <Dumbbell size={9} /> : <Activity size={9} />}
          {item.kind === 'TRAINING' ? 'TR' : 'CA'}
        </span>
        {(totalReactions > 0 || item.commentsCount > 0) && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
            {totalReactions > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                {item.reactions.slice(0, 3).map((r) => REACTION_KINDS.find((k) => k.key === r.kind)?.emoji).join('')}
                <span className="ml-0.5 tabular-nums">{totalReactions}</span>
              </span>
            )}
            {item.commentsCount > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                <MessageCircle size={9} />
                <span className="tabular-nums">{item.commentsCount}</span>
              </span>
            )}
          </span>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pt-6 pb-1.5"
        >
          <div className="flex items-center gap-1.5">
            {item.user.avatarUrl ? (
              <img src={avatarThumbUrl(item.user.avatarUrl, 48)} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/30" />
            ) : (
              <div className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[9px] font-bold text-white">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-white">
              {displayName}
            </p>
            <span className="font-mono text-[9px] text-white/80">{dayShort}</span>
          </div>
        </div>
      </button>
      {/* Reactions bar OUTSIDE the photo button so taps don't both open zoom + react */}
      <ReactionsBar reactions={item.reactions} onReact={onReact} compact />
    </div>
  )
}
