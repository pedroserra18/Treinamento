import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { updatePrivacy } from '../services/socialService'
import { exportUserData } from '../services/authService'
import type { AuthUser } from '../types/auth'
import { sanitiseHandleInput } from '../lib/handle'
import {
  AtSign, Check, Download, Lock, LogOut, Moon, ShieldAlert, Sun,
  AlertTriangle, LifeBuoy, ArrowLeft, Smartphone, Dumbbell, Bell, Activity, Crown,
  Shield, Users as UsersIcon, ChevronRight, FileText, Info,
} from 'lucide-react'
import { InstallAppPanel } from '../components/common/InstallAppPanel'
import { NotificationsPanel } from './settings/NotificationsPanel'
import { PanelTitle, FieldLabel, ToggleRow, AboutRow } from './settings/ui'
import { MyExercisesPanel, TrainingProfilePanel, PlanPanel } from './settings/training-panels'
import { ProfilePanel, AccountPanel, HandlePanel } from './settings/account-panels'

// ─── Sidebar config ────────────────────────────────────────────────────────

type Section =
  | 'profile'
  | 'plan'
  | 'account'
  | 'handle'
  | 'training'
  | 'exercises'
  | 'notifications'
  | 'privacy'
  | 'theme'
  | 'install'
  | 'export'
  | 'support'
  | 'about'
  | 'admin'
  | 'logout'
  | 'delete'

type SectionDef = {
  id: Section
  label: string
  group: 'CONTA' | 'PREFERÊNCIAS' | 'ADMIN' | 'ZONA DE RISCO'
  icon: React.ReactNode
  danger?: boolean
  adminOnly?: boolean
}

// "Perfil" (editar avatar/nome) NÃO entra aqui de propósito: é acessado pelo
// botão "Editar perfil" na página de perfil. Mantê-lo como aba duplicaria a
// função. O painel ainda renderiza via /settings?section=profile.
const SECTIONS: SectionDef[] = [
  { id: 'account',   group: 'CONTA',         label: 'Conta',            icon: <Lock size={14} /> },
  { id: 'handle',    group: 'CONTA',         label: '@handle público',  icon: <AtSign size={14} /> },
  { id: 'plan',      group: 'CONTA',         label: 'Plano',            icon: <Crown size={14} /> },
  { id: 'exercises', group: 'CONTA',         label: 'Meus exercícios',  icon: <Dumbbell size={14} /> },
  { id: 'training',  group: 'PREFERÊNCIAS',  label: 'Perfil de treino', icon: <Activity size={14} /> },
  { id: 'notifications', group: 'PREFERÊNCIAS', label: 'Notificações',   icon: <Bell size={14} /> },
  { id: 'privacy',   group: 'PREFERÊNCIAS',  label: 'Privacidade',      icon: <ShieldAlert size={14} /> },
  { id: 'theme',     group: 'PREFERÊNCIAS',  label: 'Tema',             icon: <Moon size={14} /> },
  { id: 'install',   group: 'PREFERÊNCIAS',  label: 'Instalar app',     icon: <Smartphone size={14} /> },
  { id: 'export',    group: 'PREFERÊNCIAS',  label: 'Exportar dados',   icon: <Download size={14} /> },
  { id: 'support',   group: 'PREFERÊNCIAS',  label: 'Ajuda e suporte',  icon: <LifeBuoy size={14} /> },
  { id: 'about',     group: 'PREFERÊNCIAS',  label: 'Sobre o app',      icon: <Info size={14} /> },
  { id: 'admin',     group: 'ADMIN',         label: 'Ferramentas admin', icon: <Shield size={14} />, adminOnly: true },
  { id: 'logout',    group: 'ZONA DE RISCO', label: 'Sair da conta',    icon: <LogOut size={14} /> },
  { id: 'delete',    group: 'ZONA DE RISCO', label: 'Excluir conta',    icon: <AlertTriangle size={14} />, danger: true },
]

// ─── Page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const {
    user, logout, deleteAccount, authorizedFetch, applyUserPatch, refreshUser,
    updateHandle, updateName, updateEmail, startGoogleLink,
  } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // Lets us deep-link to a specific section via `?section=handle`.
  // 'profile' é válido por deep-link (botão "Editar perfil"), mesmo não sendo
  // uma aba listada. As demais vêm de SECTIONS. Padrão = Conta.
  // Items adminOnly só aparecem se o user for ADMIN. Filtro único usado em
  // sidebar, chips do mobile e validação do deep-link via ?section=.
  const isAdmin = user?.role === 'ADMIN'
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin)

  const sectionFromUrl = params.get('section') as Section | null
  const initialSection: Section =
    sectionFromUrl && (sectionFromUrl === 'profile' || visibleSections.some((s) => s.id === sectionFromUrl))
      ? sectionFromUrl
      : 'account'
  const [section, setSection] = useState<Section>(initialSection)
  // Alterações não salvas (painéis Perfil/Handle reportam via onDirtyChange).
  const [dirty, setDirty] = useState(false)
  const [pendingSection, setPendingSection] = useState<Section | null>(null)

  const commitSection = (next: Section) => {
    setDirty(false)
    setSection(next)
    setParams({ section: next }, { replace: true })
  }

  const setSectionAndUrl = (next: Section) => {
    if (next === section) return
    if (dirty) {
      setPendingSection(next)
      return
    }
    commitSection(next)
  }

  // Avisa ao fechar/recarregar a aba com alterações não salvas.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Modo "editar perfil": tela focada (sem abas/sidebar), acessada pelo botão
  // "Editar perfil". As demais seções formam as Configurações normais.
  const isProfileEdit = section === 'profile'

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <Link
          to="/profile"
          className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)] lg:hidden"
        >
          <ArrowLeft size={11} />
          Voltar ao perfil
        </Link>
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)] sm:text-[10.5px] sm:tracking-[0.22em]">
          <span className="relative inline-flex h-[7px] w-[7px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[var(--brand)]" />
          </span>
          {isProfileEdit ? 'Perfil · foto e nome' : 'Sua conta · preferências'}
        </div>
        {isProfileEdit ? (
          <>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
              Editar <span className="font-serif-accent text-[var(--brand-strong)]">perfil</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
              Sua foto e nome, exibidos no feed e no seu perfil público.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
              Config<span className="font-serif-accent text-[var(--brand-strong)]">urações</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
              Gerencie sua conta, privacidade e preferências.
            </p>
          </>
        )}
      </motion.header>

      {/* Seletor de seção no mobile/tablet — chips on-brand (sidebar fica < lg) */}
      {!isProfileEdit && (
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 lg:hidden">
        {visibleSections.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSectionAndUrl(s.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                  : s.danger
                    ? 'border-[var(--line)] text-red-500 hover:bg-red-500/8'
                    : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
              }`}
            >
              <span className={`grid h-4 w-4 place-items-center ${active ? 'text-white' : s.danger ? 'text-red-500' : 'text-[var(--brand)]'}`}>
                {s.icon}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>
      )}

      <div className={isProfileEdit ? '' : 'grid gap-4 lg:grid-cols-[220px_1fr]'}>
        {/* ────────── SIDEBAR (oculta no modo editar perfil) ────────── */}
        {!isProfileEdit && (
        <aside className="hidden space-y-4 lg:block">
          {(['CONTA', 'PREFERÊNCIAS', 'ADMIN', 'ZONA DE RISCO'] as const).map((group) => {
            const groupItems = visibleSections.filter((s) => s.group === group)
            if (groupItems.length === 0) return null
            return (
            <div key={group}>
              <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                {group}
              </p>
              <nav className="flex flex-col gap-0.5">
                {groupItems.map((s) => {
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
            )
          })}
        </aside>
        )}

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
                  updateName={updateName}
                  avatarUrl={user?.avatarUrl ?? null}
                  name={user?.name ?? ''}
                  onDirtyChange={setDirty}
                />
              )}
              {section === 'account' && (
                <AccountPanel
                  authorizedFetch={authorizedFetch}
                  email={user?.email ?? ''}
                  updateEmail={updateEmail}
                  startGoogleLink={startGoogleLink}
                />
              )}
              {section === 'handle' && (
                <HandlePanel
                  currentHandle={user?.handle ?? ''}
                  updateHandle={updateHandle}
                  onDirtyChange={setDirty}
                />
              )}
              {section === 'training' && (
                <TrainingProfilePanel
                  authorizedFetch={authorizedFetch}
                  applyUserPatch={applyUserPatch}
                  user={user}
                />
              )}
              {section === 'plan' && (
                <PlanPanel
                  authorizedFetch={authorizedFetch}
                  refreshUser={refreshUser}
                  user={user}
                />
              )}
              {section === 'exercises' && (
                <MyExercisesPanel authorizedFetch={authorizedFetch} />
              )}
              {section === 'notifications' && (
                <NotificationsPanel />
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
              {section === 'install' && <InstallAppPanel />}
              {section === 'export' && <ExportPanel authorizedFetch={authorizedFetch} />}
              {section === 'support' && <SupportPanel onOpen={() => navigate('/support')} />}
              {section === 'about' && <AboutPanel user={user} />}
              {section === 'admin' && isAdmin && <AdminToolsPanel onNavigate={navigate} />}
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

      {/* Aviso de alterações não salvas ao trocar de seção */}
      {pendingSection ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setPendingSection(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--text)]">Alterações não salvas</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Você tem alterações que ainda não foram salvas. Se sair desta seção agora, elas serão descartadas.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSection(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => { const next = pendingSection; setPendingSection(null); commitSection(next) }}
                className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-strong)]"
              >
                Descartar e sair
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// ─── Panels ───────────────────────────────────────────────────────────────

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

function ExportPanel({
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

// ─── About / Legal ────────────────────────────────────────────────────────
// Acesso aos documentos legais a partir do app instalado (no PWA o user não
// tem barra de URL, então sem essa página os termos/privacidade ficam
// inalcançáveis pra quem já está logado).

function AboutPanel({ user }: { user: AuthUser | null }) {
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

function AdminToolsPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
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

