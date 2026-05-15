import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { ImageViewer } from '../components/common/ImageViewer'
import { updateAvatar, updatePrivacy } from '../services/socialService'
import { sanitiseHandleInput, validateHandle } from '../lib/handle'
import {
  AtSign, Check, Download, Lock, LogOut, Moon, ShieldAlert, Sun,
  User as UserIcon, AlertTriangle, LifeBuoy, ArrowLeft,
} from 'lucide-react'

// ─── Sidebar config ────────────────────────────────────────────────────────

type Section =
  | 'profile'
  | 'account'
  | 'handle'
  | 'privacy'
  | 'theme'
  | 'export'
  | 'support'
  | 'logout'
  | 'delete'

type SectionDef = {
  id: Section
  label: string
  group: 'CONTA' | 'PREFERÊNCIAS' | 'ZONA DE RISCO'
  icon: React.ReactNode
  danger?: boolean
}

const SECTIONS: SectionDef[] = [
  { id: 'profile',  group: 'CONTA',         label: 'Perfil',           icon: <UserIcon size={14} /> },
  { id: 'account',  group: 'CONTA',         label: 'Conta',            icon: <Lock size={14} /> },
  { id: 'handle',   group: 'CONTA',         label: '@handle público',  icon: <AtSign size={14} /> },
  { id: 'privacy',  group: 'PREFERÊNCIAS',  label: 'Privacidade',      icon: <ShieldAlert size={14} /> },
  { id: 'theme',    group: 'PREFERÊNCIAS',  label: 'Tema',             icon: <Moon size={14} /> },
  { id: 'export',   group: 'PREFERÊNCIAS',  label: 'Exportar dados',   icon: <Download size={14} /> },
  { id: 'support',  group: 'PREFERÊNCIAS',  label: 'Ajuda e suporte',  icon: <LifeBuoy size={14} /> },
  { id: 'logout',   group: 'ZONA DE RISCO', label: 'Sair da conta',    icon: <LogOut size={14} /> },
  { id: 'delete',   group: 'ZONA DE RISCO', label: 'Excluir conta',    icon: <AlertTriangle size={14} />, danger: true },
]

// ─── Page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user, logout, deleteAccount, authorizedFetch, applyUserPatch, refreshUser, updateHandle } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // Lets us deep-link to a specific section via `?section=handle`.
  const sectionFromUrl = params.get('section') as Section | null
  const initialSection: Section = sectionFromUrl && SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : 'profile'
  const [section, setSection] = useState<Section>(initialSection)

  const setSectionAndUrl = (next: Section) => {
    setSection(next)
    setParams({ section: next }, { replace: true })
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-1"
      >
        <Link
          to="/profile"
          className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={11} />
          Voltar ao perfil
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          Config<span className="font-serif-accent text-[var(--brand-strong)]">urações</span>
        </h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Gerencie sua conta, privacidade e preferências.
        </p>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* ────────── SIDEBAR ────────── */}
        <aside className="space-y-4">
          {(['CONTA', 'PREFERÊNCIAS', 'ZONA DE RISCO'] as const).map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                {group}
              </p>
              <nav className="flex flex-col gap-0.5">
                {SECTIONS.filter((s) => s.group === group).map((s) => {
                  const active = section === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSectionAndUrl(s.id)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                        active
                          ? 'bg-[var(--surface-hover)] font-semibold text-[var(--text)]'
                          : s.danger
                            ? 'text-red-500 hover:bg-red-500/8'
                            : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className={`grid h-5 w-5 place-items-center ${active ? 'text-[var(--brand)]' : ''}`}>
                        {s.icon}
                      </span>
                      {s.label}
                    </button>
                  )
                })}
              </nav>
            </div>
          ))}
        </aside>

        {/* ────────── PANEL ────────── */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {section === 'profile' && (
                <ProfilePanel
                  authorizedFetch={authorizedFetch}
                  applyUserPatch={applyUserPatch}
                  refreshUser={refreshUser}
                  avatarUrl={user?.avatarUrl ?? null}
                  name={user?.name ?? ''}
                />
              )}
              {section === 'account' && (
                <AccountPanel email={user?.email ?? ''} />
              )}
              {section === 'handle' && (
                <HandlePanel
                  currentHandle={user?.handle ?? ''}
                  updateHandle={updateHandle}
                />
              )}
              {section === 'privacy' && (
                <PrivacyPanel
                  authorizedFetch={authorizedFetch}
                  applyUserPatch={applyUserPatch}
                  isPrivate={user?.isPrivate ?? false}
                  showFollowLists={user?.showFollowLists ?? true}
                />
              )}
              {section === 'theme' && (
                <ThemePanel theme={theme} toggleTheme={toggleTheme} />
              )}
              {section === 'export' && <ExportPanel />}
              {section === 'support' && <SupportPanel onOpen={() => navigate('/support')} />}
              {section === 'logout' && <LogoutPanel logout={logout} />}
              {section === 'delete' && (
                <DeletePanel
                  currentHandle={user?.handle ?? ''}
                  deleteAccount={deleteAccount}
                  onDeleted={() => navigate('/login', { replace: true })}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

// ─── Panels ───────────────────────────────────────────────────────────────

function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-[var(--muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </label>
  )
}

// ─── Profile (avatar + name) ──────────────────────────────────────────────

function ProfilePanel({
  authorizedFetch, applyUserPatch, refreshUser, avatarUrl, name,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<{ avatarUrl: string | null; name: string | null }>) => void
  refreshUser: () => Promise<void>
  avatarUrl: string | null
  name: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(avatarUrl)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  useEffect(() => {
    if (!dirty) setPreview(avatarUrl)
  }, [avatarUrl, dirty])

  // Same compression pipeline used by the previous Profile page — 256px max,
  // JPEG q=0.85 — so the avatar fits in our DB row without bloating it.
  const handleAvatar = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const original = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const target = 256
        const scale = Math.min(target / img.width, target / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setPreview(original)
          setDirty(true)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        setPreview(canvas.toDataURL('image/jpeg', 0.85))
        setDirty(true)
      }
      img.onerror = () => {
        setPreview(original)
        setDirty(true)
      }
      img.src = original
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    if (!preview || preview === avatarUrl) return
    setSaving(true)
    setError(null)
    try {
      const result = await updateAvatar(authorizedFetch as never, preview)
      const persistedUrl = result.avatarUrl ?? preview
      applyUserPatch({ avatarUrl: persistedUrl })
      setPreview(persistedUrl)
      setDirty(false)
      try { await refreshUser() } catch { /* server may lag, local patch already applied */ }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar avatar')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateAvatar(authorizedFetch as never, null)
      applyUserPatch({ avatarUrl: null })
      setPreview(null)
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover avatar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelTitle title="Perfil" subtitle="Sua foto e nome aparecem no feed e em todos os lugares públicos." />

      <FieldLabel>Foto de perfil</FieldLabel>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => preview && setViewerOpen(true)}
          disabled={!preview}
          aria-label="Ver foto em tamanho grande"
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-default"
        >
          {preview
            ? <img src={preview} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--muted)]">{(name?.[0] ?? '?').toUpperCase()}</span>}
        </button>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Alterar fotografia
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Remover
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleAvatar(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-6">
        <FieldLabel>Nome</FieldLabel>
        <input
          type="text"
          value={name}
          readOnly
          className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)]"
          title="A alteração de nome ainda não está disponível"
        />
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          A alteração de nome ainda não está disponível.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-500">Avatar salvo.</p>}

      {dirty && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setPreview(avatarUrl); setDirty(false); setError(null) }}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            {saving ? 'Salvando…' : <>Guardar alterações <Check size={12} /></>}
          </button>
        </div>
      )}

      {viewerOpen && preview && (
        <ImageViewer src={preview} alt={name || null} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  )
}

// ─── Account (email only, password change not wired yet) ──────────────────

function AccountPanel({ email }: { email: string }) {
  return (
    <div>
      <PanelTitle title="Conta" subtitle="Email e credenciais usadas para entrar." />

      <FieldLabel>Email</FieldLabel>
      <input
        type="email"
        value={email}
        readOnly
        className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)]"
      />
      <p className="mt-1.5 text-[11px] text-[var(--muted)]">
        A alteração de email ainda não está disponível.
      </p>

      <div className="mt-6">
        <FieldLabel>Senha</FieldLabel>
        <p className="text-[13px] text-[var(--muted)]">
          Para alterar a senha, use o fluxo de "esqueci minha senha" na tela de login —
          ele envia um código para o seu email.
        </p>
      </div>
    </div>
  )
}

// ─── Handle ───────────────────────────────────────────────────────────────

function HandlePanel({
  currentHandle, updateHandle,
}: {
  currentHandle: string
  updateHandle: (handle: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(currentHandle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const formatError = validateHandle(draft)
  const changed = draft.trim().toLowerCase() !== currentHandle

  const save = async () => {
    const next = draft.trim().toLowerCase()
    if (!next || formatError || !changed) return
    setSaving(true)
    setError(null)
    try {
      await updateHandle(next)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar handle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelTitle
        title="@handle público"
        subtitle="É como outros usuários encontram você no feed e nos perfis públicos. Letras, números, '.', '_' e '-'."
      />

      <FieldLabel>Seu handle</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] focus-within:border-[var(--brand)]">
          <span className="pl-3 pr-1 text-[var(--muted)]">@</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(sanitiseHandleInput(e.target.value))}
            className="flex-1 bg-transparent py-2 pr-3 text-sm text-[var(--text)] outline-none"
            placeholder="seu_handle"
          />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || saving || Boolean(formatError)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {formatError && changed && <p className="mt-2 text-[12px] text-amber-500">{formatError}</p>}
      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      {success && <p className="mt-2 text-[12px] text-emerald-500">Handle atualizado.</p>}
    </div>
  )
}

// ─── Privacy ──────────────────────────────────────────────────────────────

function PrivacyPanel({
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

function ToggleRow({
  label, description, checked, onToggle, disabled,
}: {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] p-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[var(--text)]">{label}</p>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
          checked
            ? 'border-[var(--brand)] bg-[var(--brand)]'
            : 'border-[var(--line)] bg-[var(--surface)]'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────

function ThemePanel({ theme, toggleTheme }: { theme: 'light' | 'dark'; toggleTheme: () => void }) {
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

function ExportPanel() {
  return (
    <div>
      <PanelTitle title="Exportar dados" subtitle="Baixe um arquivo com todos os seus treinos e configurações." />
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <p className="text-[13px] text-[var(--text)]">
          Em breve você poderá exportar todo o seu histórico em formato JSON ou CSV.
        </p>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Esta funcionalidade ainda está em desenvolvimento.
        </p>
      </div>
    </div>
  )
}

// ─── Support ──────────────────────────────────────────────────────────────

function SupportPanel({ onOpen }: { onOpen: () => void }) {
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

// ─── Logout ───────────────────────────────────────────────────────────────

function LogoutPanel({ logout }: { logout: () => Promise<void> }) {
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

function DeletePanel({
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
