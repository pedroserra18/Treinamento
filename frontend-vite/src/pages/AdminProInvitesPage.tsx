import { useCallback, useEffect, useState } from 'react'
import { Copy, Crown, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  createProInvite,
  listProInvites,
  revokeProInvite,
  type ProInviteSummary,
} from '../services/subscriptionService'

// Painel admin pra criar e gerenciar convites single-use de upgrade pro PRO.
// Aparece em /admin/pro-invites (ADMIN-only via ProtectedRoute + role check
// no backend). Geração de token é simples: nota opcional + validade opcional.
//
// Convite usado/revogado/expirado fica visível na lista pra rastreio.
export function AdminProInvitesPage() {
  const { authorizedFetch } = useAuth()
  const [invites, setInvites] = useState<ProInviteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form de criação
  const [note, setNote] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('30')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  // Copy-to-clipboard feedback per row
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await listProInvites(authorizedFetch, 100)
      setInvites(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao listar convites')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (): Promise<void> => {
    setCreating(true)
    setCreateMsg(null)
    try {
      const days = expiresInDays.trim() === '' ? undefined : Number(expiresInDays)
      const created = await createProInvite(authorizedFetch, {
        note: note.trim() || undefined,
        expiresInDays: Number.isFinite(days) && days != null && days > 0 ? days : undefined,
      })
      setInvites((prev) => [created, ...prev])
      setNote('')
      setCreateMsg('Convite criado — copie o link abaixo.')
    } catch (err) {
      setCreateMsg(err instanceof Error ? err.message : 'Falha ao criar convite')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (invite: ProInviteSummary): Promise<void> => {
    try {
      await navigator.clipboard.writeText(invite.shareUrl)
      setCopiedId(invite.id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // fallback silencioso — alguns browsers em http
    }
  }

  const handleRevoke = async (invite: ProInviteSummary): Promise<void> => {
    if (!window.confirm(`Revogar este convite${invite.note ? ` (${invite.note})` : ''}?`)) return
    try {
      await revokeProInvite(authorizedFetch, invite.id)
      setInvites((prev) =>
        prev.map((x) => (x.id === invite.id ? { ...x, revokedAt: new Date().toISOString() } : x)),
      )
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Falha ao revogar convite')
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex items-center gap-2">
        <Crown size={20} className="text-[var(--brand)]" />
        <h1 className="text-2xl font-extrabold text-[var(--text)]">Convites PRO</h1>
      </header>
      <p className="text-[13px] text-[var(--muted)]">
        Crie links single-use pra dar PRO de graça (parcerias, gifts). Cada token vale uma vez.
      </p>

      {/* Form de criação */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <h2 className="text-[14px] font-bold text-[var(--text)]">Criar novo</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='Nota (ex.: "Parceria João da X")'
            maxLength={200}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <input
            type="number"
            inputMode="numeric"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            placeholder="Dias até expirar"
            min={0}
            max={365}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Criar convite'}
          </button>
        </div>
        {createMsg && (
          <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-[11px] text-[var(--text)]">
            {createMsg}
          </p>
        )}
      </div>

      {/* Lista */}
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-[var(--text)]">
          {invites.length} {invites.length === 1 ? 'convite' : 'convites'}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">{error}</p>
      )}

      {!loading && invites.length === 0 && (
        <p className="text-center text-[12px] text-[var(--muted)]">Nenhum convite ainda. Crie um acima.</p>
      )}

      <ul className="space-y-3">
        {invites.map((inv) => {
          const status = inv.usedAt
            ? { label: 'Usado', tone: 'emerald' }
            : inv.revokedAt
              ? { label: 'Revogado', tone: 'rose' }
              : inv.expiresAt && new Date(inv.expiresAt) < new Date()
                ? { label: 'Expirado', tone: 'rose' }
                : { label: 'Disponível', tone: 'brand' }
          return (
            <li key={inv.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[var(--text)]">
                    {inv.note ?? <span className="italic text-[var(--muted)]">Sem nota</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Criado em {new Date(inv.createdAt).toLocaleString('pt-BR')}
                    {inv.expiresAt && ` · Expira em ${new Date(inv.expiresAt).toLocaleDateString('pt-BR')}`}
                    {inv.usedAt && inv.usedByName && ` · Usado por ${inv.usedByName}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    status.tone === 'emerald'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                      : status.tone === 'rose'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                        : 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand-strong)]'
                  }`}
                >
                  {status.label}
                </span>
              </div>

              {/* URL + ações — só quando disponível ou recém-copiada */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--surface-hover)] px-3 py-2 font-mono text-[11px] text-[var(--text)]">
                  {inv.shareUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(inv)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <Copy size={11} />
                  {copiedId === inv.id ? 'Copiado!' : 'Copiar'}
                </button>
                {!inv.usedAt && !inv.revokedAt && (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(inv)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-[12px] font-semibold text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 size={11} />
                    Revogar
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
