import { UserPlus, Link2, Copy } from 'lucide-react'

// Card "Convidar amigos" do lobby de um desafio (só admin): convidar amigo,
// compartilhar/copiar o link de convite e gerar um novo link. Extraído verbatim
// da CompetitionDetailPage; ações e estado ficam na página (props).
export function InviteFriendsCard({ inviteUrl, copied, onOpenFriendPicker, onShare, onCopy, onNewLink }: {
  inviteUrl: string
  copied: boolean
  onOpenFriendPicker: () => void
  onShare: () => void
  onCopy: () => void
  onNewLink: () => void
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        Convidar amigos
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Compartilhe o link abaixo no WhatsApp ou copie pra mandar de outras formas. Só pessoas que você segue mutuamente podem entrar.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenFriendPicker}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
        >
          <UserPlus size={13} />
          Convidar amigo
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <Link2 size={13} />
          Compartilhar link
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <Copy size={13} />
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        <button
          type="button"
          onClick={onNewLink}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          Novo link
        </button>
      </div>
      <p className="mt-2 break-all font-mono text-[10.5px] text-[var(--muted)]">{inviteUrl}</p>
    </section>
  )
}
