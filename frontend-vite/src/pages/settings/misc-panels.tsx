import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanitiseHandleInput } from '../../lib/handle'
import {
  AlertTriangle, Check, ChevronRight, Crown, Download, FileText,
  LifeBuoy, LogOut, Moon, ShieldAlert, Sun, Users as UsersIcon,
} from 'lucide-react'
import { updatePrivacy } from '../../services/socialService'
import { exportUserData } from '../../services/authService'
import type { AuthUser } from '../../types/auth'
import { PanelTitle, FieldLabel, ToggleRow, AboutRow } from './ui'

// ─── Privacy ──────────────────────────────────────────────────────────────

export function PrivacyPanel({
  authorizedFetch, applyUserPatch, isPrivate: initialIsPrivate, showFollowLists: initialShowFollow,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<{ isPrivate: boolean; showFollowLists: boolean }>) => void
  isPrivate: boolean
  showFollowLists: boolean
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate)
  const [showFollowLists, setShowFollowLists] = useState(initialShowFollow)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const togglePrivate = async () => {
    const next = !isPrivate
    setIsPrivate(next)
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updatePrivacy(authorizedFetch as never, { isPrivate: next })
      applyUserPatch({ isPrivate: updated.isPrivate, showFollowLists: updated.showFollowLists })
      if (updated.downgradedPosts > 0) {
        setNotice(
          `${updated.downgradedPosts} post${updated.downgradedPosts > 1 ? 's' : ''} público${updated.downgradedPosts > 1 ? 's' : ''} ${updated.downgradedPosts > 1 ? 'foram alterados' : 'foi alterado'} para "Amigos".`,
        )
        setTimeout(() => setNotice(null), 6000)
      }
    } catch (err) {
      setIsPrivate(!next)
      setError(err instanceof Error ? err.message : 'Erro ao salvar privacidade')
    } finally {
      setSaving(false)
    }
  }

  const toggleShowFollow = async () => {
    const next = !showFollowLists
    setShowFollowLists(next)
    setSaving(true)
    setError(null)
    try {
      const updated = await updatePrivacy(authorizedFetch as never, { showFollowLists: next })
      applyUserPatch({ isPrivate: updated.isPrivate, showFollowLists: updated.showFollowLists })
    } catch (err) {
      setShowFollowLists(!next)
      setError(err instanceof Error ? err.message : 'Erro ao salvar privacidade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelTitle title="Privacidade" subtitle="Controle quem pode ver seus treinos e listas de seguidores." />

      <div className="space-y-2.5">
        <ToggleRow
          label="Perfil privado"
          description="Quando ativado, somente seus seguidores aprovados veem seus posts. Posts existentes em PÚBLICO viram FRIENDS automaticamente."
          checked={isPrivate}
          onToggle={() => void togglePrivate()}
          disabled={saving}
        />
        <ToggleRow
          label="Mostrar listas de seguidores"
          description="Quando desativado, ninguém vê quem te segue ou quem você segue — nem mesmo seus seguidores."
          checked={showFollowLists}
          onToggle={() => void toggleShowFollow()}
          disabled={saving}
        />
      </div>

      {notice && <p className="mt-4 text-[12px] text-amber-500">{notice}</p>}
      {error && <p className="mt-4 text-[12px] text-red-500">{error}</p>}
    </div>
  )
}

export function ThemePanel({ theme, toggleTheme }: { theme: 'light' | 'dark'; toggleTheme: () => void }) {
  return (
    <div>
      <PanelTitle title="Tema" subtitle="Aparência do aplicativo." />

      <div className="grid gap-2 sm:grid-cols-2">
        {([
          { value: 'light', label: 'Claro', icon: <Sun size={16} /> },
          { value: 'dark',  label: 'Escuro', icon: <Moon size={16} /> },
        ] as const).map((opt) => {
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { if (theme !== opt.value) toggleTheme() }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                active
                  ? 'border-[var(--brand)] bg-[var(--brand)]/8'
                  : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-lg border ${active ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--line)] text-[var(--muted)]'}`}>
                  {opt.icon}
                </span>
                <span className="text-[13.5px] font-medium text-[var(--text)]">{opt.label}</span>
              </span>
              {active && <Check size={14} className="text-[var(--brand)]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Export data ──────────────────────────────────────────────────────────

export function ExportPanel({
  authorizedFetch,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDownloadAt, setLastDownloadAt] = useState<Date | null>(null)

  const download = async () => {
    setDownloading(true)
    setError(null)
    try {
      const blob = await exportUserData(authorizedFetch as never)
      // Browser-side download via a temporary <a download>. The server already
      // suggested a filename via Content-Disposition, but we set one too so
      // some browsers (Safari iOS, in particular) honor it reliably.
      const url = URL.createObjectURL(blob)
      const datestamp = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = url
      a.download = `serraathlo-export-${datestamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setLastDownloadAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar dados')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <PanelTitle title="Exportar dados" subtitle="Baixe um arquivo JSON com todos os seus treinos, planos, medidas corporais e posts." />

      <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <p className="text-[13px] text-[var(--text)]">
          O arquivo inclui perfil, plans, sessões de treino, histórico de séries,
          medidas corporais (incluindo fotos), posts e comentários seus, e as
          listas de quem você segue / te segue.
        </p>
        <p className="mt-2 text-[12px] text-[var(--muted)]">
          Não inclui senha, refresh tokens ou credenciais OAuth.
        </p>

        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-50"
        >
          <Download size={14} />
          {downloading ? 'Preparando arquivo…' : 'Baixar export'}
        </button>

        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        {lastDownloadAt && !error && (
          <p className="mt-2 text-[12px] text-emerald-500">
            Arquivo baixado às {lastDownloadAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Support ──────────────────────────────────────────────────────────────

export function SupportPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <div>
      <PanelTitle title="Ajuda e suporte" subtitle="Dúvida, bug ou contestar uma decisão? Abra um ticket — respondemos em até 48h." />
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
      >
        <LifeBuoy size={14} />
        Abrir central de suporte
      </button>
    </div>
  )
}

// ─── About / Legal ────────────────────────────────────────────────────────
// Acesso aos documentos legais a partir do app instalado (no PWA o user não
// tem barra de URL, então sem essa página os termos/privacidade ficam
// inalcançáveis pra quem já está logado).

export function AboutPanel({ user }: { user: AuthUser | null }) {
  // Versão do build vinda do Vite (configurada no vite.config). Cai pra dev
  // quando rodando local sem build.
  const appVersion = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_APP_VERSION ?? 'dev'
  // Aceite vem do backend agora (User.acceptedTermsAt + acceptedTermsVersion).
  // Multi-dispositivo, prova legal sólida.
  const acceptance = user?.acceptedTermsAt
    ? { version: user.acceptedTermsVersion ?? undefined, acceptedAt: user.acceptedTermsAt }
    : null

  return (
    <div>
      <PanelTitle title="Sobre o app" subtitle="Documentos legais, versão atual e informações de contato." />

      {/* Documentos */}
      <div className="space-y-2">
        <Link
          to="/termos"
          target="_blank"
          rel="noopener"
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
            <FileText size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--text)]">Termos de Uso</span>
            <span className="block truncate text-[11.5px] text-[var(--muted)]">Regras do app, planos PRO/FREE, IA, foro.</span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
        </Link>

        <Link
          to="/privacidade"
          target="_blank"
          rel="noopener"
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <ShieldAlert size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[var(--text)]">Política de Privacidade</span>
            <span className="block truncate text-[11.5px] text-[var(--muted)]">Dados coletados, LGPD, seus direitos.</span>
          </span>
          <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
        </Link>
      </div>

      {/* Versão + aceite */}
      <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-1 text-[12.5px]">
        <AboutRow label="Versão" value={<span className="font-mono text-[11px] text-[var(--text)]">{appVersion}</span>} />
        <AboutRow
          label="Termos aceitos em"
          value={
            acceptance?.acceptedAt
              ? <span className="font-mono text-[11px] text-[var(--text)]">
                  {new Date(acceptance.acceptedAt).toLocaleDateString('pt-BR')}
                  {acceptance.version ? ` · v${acceptance.version}` : ''}
                </span>
              : <span className="text-[var(--muted)]">—</span>
          }
        />
        <AboutRow
          label="Contato"
          value={
            <a href="mailto:pedrovasco98765@gmail.com" className="font-mono text-[11px] text-[var(--brand-strong)] hover:underline">
              pedrovasco98765@gmail.com
            </a>
          }
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">
        SerraAthlo é um app independente em desenvolvimento. Pra reportar bug, sugerir feature ou
        dúvidas sobre seus dados, escreva pra o e-mail acima.
      </p>
    </div>
  )
}

export function AdminToolsPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const items = [
    {
      to: '/admin/pro-invites',
      label: 'Convites PRO',
      desc: 'Criar e gerenciar links de upgrade gratuito.',
      icon: <Crown size={16} />,
    },
    {
      to: '/admin/users',
      label: 'Usuários',
      desc: 'Listar, banir e gerenciar contas.',
      icon: <UsersIcon size={16} />,
    },
    {
      to: '/admin/support',
      label: 'Tickets de suporte',
      desc: 'Responder dúvidas e contestar decisões.',
      icon: <LifeBuoy size={16} />,
    },
  ]
  return (
    <div>
      <PanelTitle title="Ferramentas admin" subtitle="Atalhos pras páginas administrativas." />
      <div className="space-y-2">
        {items.map((it) => (
          <button
            key={it.to}
            type="button"
            onClick={() => onNavigate(it.to)}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
              {it.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[var(--text)]">{it.label}</span>
              <span className="block truncate text-[11.5px] text-[var(--muted)]">{it.desc}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-[var(--muted)]" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Logout ───────────────────────────────────────────────────────────────

export function LogoutPanel({ logout }: { logout: () => Promise<void> }) {
  return (
    <div>
      <PanelTitle title="Sair da conta" subtitle="Encerra sua sessão atual neste dispositivo." />
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
      >
        <LogOut size={14} />
        Sair
      </button>
    </div>
  )
}

// ─── Delete account ───────────────────────────────────────────────────────

export function DeletePanel({
  currentHandle, deleteAccount, onDeleted,
}: {
  currentHandle: string
  deleteAccount: (confirmHandle: string) => Promise<void>
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDelete = useMemo(
    () => confirm.trim().toLowerCase() === currentHandle.toLowerCase() && confirm.length > 0,
    [confirm, currentHandle],
  )

  const submit = async () => {
    if (!canDelete || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(confirm.trim().toLowerCase())
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir conta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PanelTitle title="Excluir conta" subtitle="Ação permanente — todos os seus treinos, posts, comentários e seguidores serão apagados." />

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="mb-3 flex items-start gap-2 text-red-500">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[13.5px] font-semibold">Esta ação não pode ser desfeita.</p>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">
              Sua conta e todos os dados associados serão removidos permanentemente do servidor.
              Posts compartilhados, comentários, planos e histórico de treinos serão apagados.
            </p>
          </div>
        </div>

        <FieldLabel>
          Para confirmar, digite seu @handle: <span className="text-red-500">{currentHandle}</span>
        </FieldLabel>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(sanitiseHandleInput(e.target.value))}
          placeholder={currentHandle}
          autoComplete="off"
          className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        />

        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canDelete || busy}
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-500 bg-red-500 px-4 text-[13px] font-semibold text-white shadow-[0_8px_16px_-10px_rgba(239,68,68,0.55)] transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Excluindo…' : 'Excluir minha conta permanentemente'}
        </button>
      </div>
    </div>
  )
}

