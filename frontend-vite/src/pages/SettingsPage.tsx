import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { ImageViewer } from '../components/common/ImageViewer'
import { updateAvatar, updatePrivacy } from '../services/socialService'
import {
  confirmForgotPasswordWithCode,
  exportUserData,
  getGoogleLinkStatus,
  getProfileDefaults,
  requestEmailChangeCode,
  requestForgotPasswordCode,
  updateBirthDate,
  updateGender,
  updateProfileFields,
} from '../services/authService'
import type { AuthUser, ExperienceLevel, PrimaryGoal } from '../types/auth'
import { sanitiseHandleInput, validateHandle } from '../lib/handle'
import {
  AtSign, Check, Download, Lock, LogOut, Moon, ShieldAlert, Sun,
  AlertTriangle, LifeBuoy, ArrowLeft, Smartphone, Dumbbell, Trash2, Bell, Activity, Crown,
  Shield, Users as UsersIcon, ChevronRight, FileText, Info,
} from 'lucide-react'
import { InstallAppPanel } from '../components/common/InstallAppPanel'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import {
  deletePrivateExercise,
  getMyExerciseStats,
  getMyPrivateExercises,
  type MyExerciseStats,
} from '../services/workoutService'
import type { ExerciseOption } from '../types/workout'
import { usePushNotifications } from '../hooks/usePushNotifications'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../services/pushService'
import {
  getPlanSummary,
  redeemProInvite,
  type PlanFeatureKey,
  type PlanSummary,
} from '../services/subscriptionService'
import { Sparkles, CheckCircle2 } from 'lucide-react'

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
  authorizedFetch, applyUserPatch, refreshUser, updateName, avatarUrl, name, onDirtyChange,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<{ avatarUrl: string | null; name: string | null }>) => void
  refreshUser: () => Promise<void>
  updateName: (name: string) => Promise<void>
  avatarUrl: string | null
  name: string
  onDirtyChange?: (dirty: boolean) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(avatarUrl)
  const [avatarDirty, setAvatarDirty] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  useEffect(() => {
    if (!avatarDirty) setPreview(avatarUrl)
  }, [avatarUrl, avatarDirty])

  // Re-sync the local name draft if the cached user changes (e.g. another
  // tab updated it, or after a successful save).
  useEffect(() => {
    setNameDraft(name)
  }, [name])

  // Reporta "alterações não salvas" ao pai (nome editado ou avatar trocado).
  const isDirty = nameDraft.trim() !== name.trim() || avatarDirty
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const trimmedName = nameDraft.trim()
  const nameDirty = trimmedName !== name && trimmedName.length >= 2
  const nameTooShort = trimmedName.length > 0 && trimmedName.length < 2
  const nameTooLong = trimmedName.length > 120
  const dirty = avatarDirty || nameDirty

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
          setAvatarDirty(true)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        setPreview(canvas.toDataURL('image/jpeg', 0.85))
        setAvatarDirty(true)
      }
      img.onerror = () => {
        setPreview(original)
        setAvatarDirty(true)
      }
      img.src = original
    }
    reader.readAsDataURL(file)
  }

  // Single save handler that commits whichever fields actually changed,
  // surfacing the first error that comes up. We do avatar first because it's
  // the more common change; name fails fast if validation rejected it.
  const save = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      if (avatarDirty && preview && preview !== avatarUrl) {
        const result = await updateAvatar(authorizedFetch as never, preview)
        const persistedUrl = result.avatarUrl ?? preview
        applyUserPatch({ avatarUrl: persistedUrl })
        setPreview(persistedUrl)
        setAvatarDirty(false)
      }
      if (nameDirty) {
        await updateName(trimmedName)
      }
      try { await refreshUser() } catch { /* server may lag, local patch already applied */ }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alterações')
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
      setAvatarDirty(false)
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
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          maxLength={120}
          placeholder="Como você quer ser chamado"
          className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
        />
        {nameTooShort && (
          <p className="mt-1.5 text-[11px] text-amber-500">Mínimo 2 caracteres.</p>
        )}
        {nameTooLong && (
          <p className="mt-1.5 text-[11px] text-amber-500">Máximo 120 caracteres.</p>
        )}
        {!nameTooShort && !nameTooLong && (
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">
            Aparece no feed, no perfil público e em comentários.
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-500">Alterações salvas.</p>}

      {dirty && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPreview(avatarUrl)
              setAvatarDirty(false)
              setNameDraft(name)
              setError(null)
            }}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || nameTooLong || (nameDirty && nameTooShort)}
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

// ─── Account (email + password, both via 6-digit code verification) ──────

function AccountPanel({
  authorizedFetch, email, updateEmail, startGoogleLink,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  email: string
  updateEmail: (newEmail: string, code: string) => Promise<void>
  startGoogleLink: () => Promise<void>
}) {
  // Google link state — purely a "connecting…" indicator since the actual
  // OAuth redirect happens via window.location and this component unmounts.
  // If the call rejects before redirecting (network error etc.), we surface
  // the message inline.
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const [googleLinkError, setGoogleLinkError] = useState<string | null>(null)
  // null = ainda carregando o status; true/false = vinculado ou não.
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    void getGoogleLinkStatus(authorizedFetch as never)
      .then((linked) => { if (!cancelled) setGoogleLinked(linked) })
      .catch(() => { if (!cancelled) setGoogleLinked(false) })
    return () => { cancelled = true }
  }, [authorizedFetch])

  // Data de nascimento — usada pelo quiz da IA pra calcular a idade
  // automaticamente. Carrega o valor atual e salva ao alterar.
  const [birthDate, setBirthDate] = useState('')
  const [birthDateSaved, setBirthDateSaved] = useState(false)
  // Gênero — salvo no perfil e reutilizado pelo quiz da IA (pula a pergunta).
  const [gender, setGender] = useState<'' | 'Masculino' | 'Feminino'>('')
  const [genderSaved, setGenderSaved] = useState(false)
  useEffect(() => {
    let cancelled = false
    void getProfileDefaults(authorizedFetch as never)
      .then((d) => {
        if (cancelled) return
        if (d.birthDate) setBirthDate(d.birthDate)
        if (d.gender === 'Masculino' || d.gender === 'Feminino') setGender(d.gender)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authorizedFetch])

  const saveBirthDate = async (value: string) => {
    setBirthDate(value)
    try {
      await updateBirthDate(authorizedFetch as never, value || null)
      setBirthDateSaved(true)
      setTimeout(() => setBirthDateSaved(false), 2500)
    } catch { /* silencioso */ }
  }

  const saveGender = async (value: 'Masculino' | 'Feminino') => {
    setGender(value)
    try {
      await updateGender(authorizedFetch as never, value)
      setGenderSaved(true)
      setTimeout(() => setGenderSaved(false), 2500)
    } catch { /* silencioso */ }
  }

  const connectGoogle = async () => {
    setLinkingGoogle(true)
    setGoogleLinkError(null)
    try {
      // On success, this navigates away — nothing else runs.
      await startGoogleLink()
    } catch (err) {
      setGoogleLinkError(err instanceof Error ? err.message : 'Erro ao conectar Google')
      setLinkingGoogle(false)
    }
  }

  // Email change: two-phase. Phase 1 = type new email + receive code; Phase 2 =
  // type code + confirm. The local `emailStep` drives which UI shows.
  type EmailStep = 'idle' | 'awaitingCode'
  const [emailStep, setEmailStep] = useState<EmailStep>('idle')
  const [emailDraft, setEmailDraft] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailConfirming, setEmailConfirming] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Same email pattern the registration zod schema accepts after .toLowerCase().
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())
  const emailMatchesCurrent = emailDraft.trim().toLowerCase() === email.toLowerCase()
  const canRequestCode = emailLooksValid && !emailMatchesCurrent && !emailSending

  const requestCode = async () => {
    if (!canRequestCode) return
    setEmailSending(true)
    setEmailError(null)
    try {
      await requestEmailChangeCode(authorizedFetch as never, emailDraft.trim().toLowerCase())
      setEmailStep('awaitingCode')
      setEmailCode('')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao enviar código')
    } finally {
      setEmailSending(false)
    }
  }

  const confirmCode = async () => {
    if (emailCode.trim().length !== 6 || emailConfirming) return
    setEmailConfirming(true)
    setEmailError(null)
    try {
      await updateEmail(emailDraft.trim().toLowerCase(), emailCode.trim())
      setEmailStep('idle')
      setEmailDraft('')
      setEmailCode('')
      setEmailSuccess(true)
      setTimeout(() => setEmailSuccess(false), 3500)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao confirmar troca de email')
    } finally {
      setEmailConfirming(false)
    }
  }

  const cancelEmailFlow = () => {
    setEmailStep('idle')
    setEmailDraft('')
    setEmailCode('')
    setEmailError(null)
  }

  // Password change: piggy-backs on the existing forgot-password endpoints.
  // Phase 1 = send code to the user's CURRENT email; Phase 2 = type code +
  // new password. No new backend route needed.
  type PwStep = 'idle' | 'awaitingCode'
  const [pwStep, setPwStep] = useState<PwStep>('idle')
  const [pwCode, setPwCode] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwSending, setPwSending] = useState(false)
  const [pwConfirming, setPwConfirming] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const requestPwCode = async () => {
    if (pwSending || !email) return
    setPwSending(true)
    setPwError(null)
    try {
      await requestForgotPasswordCode({ email })
      setPwStep('awaitingCode')
      setPwCode('')
      setPwNew('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Erro ao enviar código')
    } finally {
      setPwSending(false)
    }
  }

  const confirmPw = async () => {
    if (pwCode.trim().length !== 6 || pwNew.length < 8 || pwConfirming) return
    setPwConfirming(true)
    setPwError(null)
    try {
      await confirmForgotPasswordWithCode({
        email,
        verificationCode: pwCode.trim(),
        newPassword: pwNew,
      })
      setPwStep('idle')
      setPwCode('')
      setPwNew('')
      setPwSuccess(true)
      setTimeout(() => setPwSuccess(false), 3500)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Erro ao alterar senha')
    } finally {
      setPwConfirming(false)
    }
  }

  const cancelPwFlow = () => {
    setPwStep('idle')
    setPwCode('')
    setPwNew('')
    setPwError(null)
  }

  return (
    <div>
      <PanelTitle title="Conta" subtitle="Email e credenciais usadas para entrar." />

      {/* ── EMAIL ────────────────────────────────────────────────────── */}
      <FieldLabel>Email atual</FieldLabel>
      <input
        type="email"
        value={email}
        readOnly
        className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)]"
      />

      <div className="mt-4 max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
        {emailStep === 'idle' && (
          <>
            <FieldLabel>Novo email</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="voce@dominio.com"
                autoComplete="email"
                className="flex-1 min-w-[200px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={!canRequestCode}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {emailSending ? 'Enviando…' : 'Enviar código'}
              </button>
            </div>
            {emailDraft && emailMatchesCurrent && (
              <p className="mt-2 text-[11px] text-amber-500">Digite um email diferente do atual.</p>
            )}
            {emailDraft && !emailLooksValid && !emailMatchesCurrent && (
              <p className="mt-2 text-[11px] text-amber-500">Formato de email inválido.</p>
            )}
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Enviamos um código de 6 dígitos para o <b>novo</b> email pra confirmar que ele é seu.
            </p>
          </>
        )}

        {emailStep === 'awaitingCode' && (
          <>
            <FieldLabel>Código enviado para {emailDraft}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                autoFocus
                className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-base tracking-[0.3em] text-[var(--text)] outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => void confirmCode()}
                disabled={emailCode.length !== 6 || emailConfirming}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {emailConfirming ? 'Confirmando…' : 'Confirmar troca'}
              </button>
              <button
                type="button"
                onClick={cancelEmailFlow}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
              >
                Cancelar
              </button>
            </div>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={emailSending}
              className="mt-2 font-mono text-[11px] text-[var(--muted)] underline hover:text-[var(--text)] disabled:opacity-50"
            >
              {emailSending ? 'Reenviando…' : 'Reenviar código'}
            </button>
          </>
        )}

        {emailError && <p className="mt-2 text-[12px] text-red-500">{emailError}</p>}
        {emailSuccess && <p className="mt-2 text-[12px] text-emerald-500">Email atualizado.</p>}
      </div>

      {/* ── DATA DE NASCIMENTO ──────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Data de nascimento</FieldLabel>
        <div className="max-w-md">
          <input
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            min="1920-01-01"
            onChange={(e) => void saveBirthDate(e.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
          />
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            Usada pelo treino por IA pra calcular sua idade automaticamente.
          </p>
          {birthDateSaved && <p className="mt-1 text-[12px] text-emerald-500">Salvo.</p>}
        </div>
      </div>

      {/* ── GÊNERO ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Gênero</FieldLabel>
        <div className="max-w-md">
          <div className="grid grid-cols-2 gap-2">
            {(['Masculino', 'Feminino'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => void saveGender(g)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  gender === g
                    ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                    : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/40'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            Usado pelo treino por IA pra definir a ênfase muscular padrão.
          </p>
          {genderSaved && <p className="mt-1 text-[12px] text-emerald-500">Salvo.</p>}
        </div>
      </div>

      {/* ── GOOGLE LINK ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Login com Google</FieldLabel>
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
          {googleLinked === true ? (
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="shrink-0">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-11.3 8c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10.5 0 19-8.5 19-19 0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8a12 12 0 0 1 11.1-7.5c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 16.3 5 9.7 9.4 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.5-5.3l-6.2-5.3a12 12 0 0 1-7.3 2.6 12 12 0 0 1-11.3-8l-6.6 5.1C9.5 38.5 16.2 43 24 43z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.4l6.2 5.3C40.1 36.7 44 31.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
                  <Check size={14} className="text-emerald-500" />
                  Conta Google conectada
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">{email}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[13px] text-[var(--text)]">
                Conecte sua conta Google para poder entrar com um clique nas próximas
                vezes (sem precisar digitar email e senha).
              </p>
              <p className="mb-3 text-[11.5px] text-[var(--muted)]">
                A conta Google precisa usar o mesmo email da sua conta atual{' '}
                <b className="text-[var(--text)]">({email})</b> — caso contrário a
                vinculação será recusada.
              </p>
              <button
                type="button"
                onClick={() => void connectGoogle()}
                disabled={linkingGoogle || googleLinked === null}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {/* Google "G" multi-color logo, inline SVG so we don't pull a CDN */}
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-11.3 8c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10.5 0 19-8.5 19-19 0-1.3-.1-2.4-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8a12 12 0 0 1 11.1-7.5c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 16.3 5 9.7 9.4 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.5-5.3l-6.2-5.3a12 12 0 0 1-7.3 2.6 12 12 0 0 1-11.3-8l-6.6 5.1C9.5 38.5 16.2 43 24 43z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.4l6.2 5.3C40.1 36.7 44 31.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                </svg>
                {linkingGoogle ? 'Conectando…' : 'Conectar conta Google'}
              </button>
              {googleLinkError && (
                <p className="mt-2 text-[12px] text-red-500">{googleLinkError}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PASSWORD ─────────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Senha</FieldLabel>
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
          {pwStep === 'idle' && (
            <>
              <p className="mb-2 text-[13px] text-[var(--text)]">
                Para alterar a senha, enviamos um código de 6 dígitos para o seu email atual.
              </p>
              <button
                type="button"
                onClick={() => void requestPwCode()}
                disabled={pwSending || !email}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {pwSending ? 'Enviando…' : 'Alterar senha'}
              </button>
            </>
          )}

          {pwStep === 'awaitingCode' && (
            <div className="space-y-3">
              <div>
                <FieldLabel>Código enviado para {email}</FieldLabel>
                <input
                  type="text"
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-base tracking-[0.3em] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
              </div>
              <div>
                <FieldLabel>Nova senha</FieldLabel>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
                {pwNew.length > 0 && pwNew.length < 8 && (
                  <p className="mt-1.5 text-[11px] text-amber-500">Mínimo 8 caracteres.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void confirmPw()}
                  disabled={pwCode.length !== 6 || pwNew.length < 8 || pwConfirming}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
                >
                  {pwConfirming ? 'Salvando…' : 'Salvar nova senha'}
                </button>
                <button
                  type="button"
                  onClick={cancelPwFlow}
                  className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Cancelar
                </button>
              </div>
              <button
                type="button"
                onClick={() => void requestPwCode()}
                disabled={pwSending}
                className="font-mono text-[11px] text-[var(--muted)] underline hover:text-[var(--text)] disabled:opacity-50"
              >
                {pwSending ? 'Reenviando…' : 'Reenviar código'}
              </button>
            </div>
          )}

          {pwError && <p className="mt-2 text-[12px] text-red-500">{pwError}</p>}
          {pwSuccess && <p className="mt-2 text-[12px] text-emerald-500">Senha alterada.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Handle ───────────────────────────────────────────────────────────────

function HandlePanel({
  currentHandle, updateHandle, onDirtyChange,
}: {
  currentHandle: string
  updateHandle: (handle: string) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState(currentHandle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const formatError = validateHandle(draft)
  const changed = draft.trim().toLowerCase() !== currentHandle

  useEffect(() => {
    onDirtyChange?.(changed)
  }, [changed, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

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
      {/* iOS-style toggle. We use inline-flex + items-center so the knob is
          vertically centered without depending on `absolute top-[2px]`, which
          was rendering inconsistently inside the panel (knob sized 0 in some
          builds, making the toggle look like a solid bar). */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border px-[2px] transition-colors disabled:opacity-50 ${
          checked
            ? 'border-[var(--brand)] bg-[var(--brand)]'
            : 'border-[var(--line)] bg-[var(--surface-hover)]'
        }`}
      >
        <span
          aria-hidden
          className={`block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out ${
            checked ? 'translate-x-[20px]' : 'translate-x-0'
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

function AboutRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className="text-right text-[12.5px] text-[var(--text)]">{value}</span>
    </div>
  )
}

// ─── Admin tools ──────────────────────────────────────────────────────────
// Painel só visível pra ADMIN (filtro na sidebar/chips garante isso). Concentra
// links pras páginas administrativas que não cabem no navbar principal,
// especialmente útil no PWA mobile onde não há barra de URL.

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

// ─── My Exercises Panel ───────────────────────────────────────────────────
// Gerencia os exercícios PRIVATE criados pelo próprio usuário. Mostra o
// contador X/Y do plano FREE, lista cada exercício com botão de excluir e
// um ConfirmDialog destructive como guarda. Exclusão é soft-delete no
// backend — preserva histórico de treinos antigos que usaram o exercício.
function MyExercisesPanel({
  authorizedFetch,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}) {
  const [items, setItems] = useState<ExerciseOption[] | null>(null)
  const [stats, setStats] = useState<MyExerciseStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExerciseOption | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Carrega lista + stats em paralelo. Stats vem por endpoint dedicado
  // (também usa o backend pra contar) pra ficar consistente com o que o
  // CreateExerciseModal mostra — assim o usuário vê o mesmo "3/5 criados"
  // nos dois lugares.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getMyPrivateExercises(authorizedFetch),
      getMyExerciseStats(authorizedFetch),
    ])
      .then(([rows, s]) => {
        if (cancelled) return
        setItems(rows)
        setStats(s)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar')
      })
    return () => { cancelled = true }
  }, [authorizedFetch])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeletingId(target.id)
    setDeleteError(null)
    try {
      await deletePrivateExercise(authorizedFetch, target.id)
      setItems((current) => (current ?? []).filter((ex) => ex.id !== target.id))
      setStats((current) => (current ? { ...current, created: Math.max(0, current.created - 1) } : current))
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir')
    } finally {
      setDeletingId(null)
    }
  }

  const counterLabel = stats && stats.limit !== null
    ? `${stats.created}/${stats.limit} criados`
    : stats ? `${stats.created} criados` : null
  const atLimit = stats !== null && stats.limit !== null && stats.created >= stats.limit

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Meus exercícios</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Exercícios que você criou no app. Apague aqui pra liberar espaço pro plano gratuito —
          treinos e rotinas antigos que usam algum deles continuam funcionando.
        </p>
      </header>

      {counterLabel && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3">
          <div>
            <p className={`text-[14px] font-bold tabular-nums ${atLimit ? 'text-rose-500' : 'text-[var(--text)]'}`}>
              {counterLabel}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {atLimit
                ? 'Limite do plano gratuito atingido. Em breve, plano Pro com criação ilimitada.'
                : 'Plano gratuito permite até 5 exercícios personalizados.'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-center text-[12px] text-rose-500">
          {error}
        </p>
      )}

      {items === null && !error && (
        <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">Carregando…</p>
      )}

      {items !== null && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
          <Dumbbell size={28} className="mx-auto text-[var(--muted)]" />
          <p className="mt-2 text-[13px] font-medium text-[var(--text)]">
            Você ainda não criou nenhum exercício
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Crie exercícios personalizados pelo botão "Criar" dentro de "Adicionar Exercício" em qualquer treino.
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-[var(--line)]">
          {items.map((option, idx) => (
            <li
              key={option.id}
              className={`flex items-center gap-3 bg-[var(--surface)] px-3 py-3 ${
                idx < items.length - 1 ? 'border-b border-[var(--line)]' : ''
              }`}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                {option.thumbnailUrl ? (
                  <img src={option.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Dumbbell size={18} className="text-[var(--muted)]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text)]">{option.name}</p>
                {option.primaryMuscleGroup && (
                  <p className="truncate text-[11px] text-[var(--muted)]">
                    {option.primaryMuscleGroup}{option.equipment ? ` • ${option.equipment}` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setDeleteError(null); setPendingDelete(option) }}
                aria-label={`Excluir ${option.name}`}
                title="Excluir"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir exercício?"
        message={
          deleteError
            ? `Não foi possível excluir "${pendingDelete?.name ?? ''}": ${deleteError}`
            : `"${pendingDelete?.name ?? ''}" será removido dos seus exercícios personalizados. Treinos e rotinas antigos que usam esse exercício continuam preservados.`
        }
        destructive
        confirmLabel={deletingId !== null ? 'Excluindo…' : 'Excluir'}
        onConfirm={() => { void confirmDelete() }}
        onCancel={() => {
          if (deletingId !== null) return
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}

// ─── Notifications Panel ──────────────────────────────────────────────────
// Controla o opt-in de push notifications. Mostra estado atual (suportado /
// permitido / inscrito / backend configurado) com mensagens diretas pra o
// usuário saber EXATAMENTE o que precisa fazer pra ativar. O hook
// usePushNotifications cuida do fluxo de subscribe/unsubscribe; aqui só
// renderizamos botão de ação contextual.
function NotificationsPanel() {
  const { authorizedFetch } = useAuth()
  const { state, enable, disable } = usePushNotifications()
  // Toggles granulares por categoria — só fazem sentido quando o user já
  // tá inscrito pra push (subscribed=true). Carregamos no mount; updates
  // são otimistas (atualiza UI imediato, reverte se backend negar).
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<keyof NotificationPreferences | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await getNotificationPreferences(authorizedFetch)
        if (!cancelled) setPrefs(data)
      } catch (err) {
        if (!cancelled) setPrefsError(err instanceof Error ? err.message : 'Falha ao carregar preferências')
      } finally {
        if (!cancelled) setPrefsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authorizedFetch])

  const togglePref = async (key: keyof NotificationPreferences, value: boolean): Promise<void> => {
    if (!prefs) return
    // Optimistic update
    const previous = prefs
    setPrefs({ ...prefs, [key]: value })
    setPendingKey(key)
    setPrefsError(null)
    try {
      const updated = await updateNotificationPreferences(authorizedFetch, { [key]: value })
      setPrefs(updated)
    } catch (err) {
      setPrefs(previous) // rollback
      setPrefsError(err instanceof Error ? err.message : 'Falha ao salvar preferência')
    } finally {
      setPendingKey(null)
    }
  }

  const renderStatusPill = () => {
    if (state.loading) {
      return <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Verificando…</span>
    }
    if (!state.supported) {
      return <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-500">Não suportado</span>
    }
    if (state.subscribed) {
      return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">Ativado</span>
    }
    return <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Desativado</span>
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Notificações</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Receba avisos no celular quando o descanso entre séries terminar, mesmo com o app fechado.
        </p>
      </header>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-[var(--brand)]" />
            <span className="text-[14px] font-bold text-[var(--text)]">Push notifications</span>
          </div>
          {renderStatusPill()}
        </div>

        <ul className="mt-3 space-y-1 text-[12px] text-[var(--muted)]">
          <li className="flex items-center gap-1.5">
            <span className={state.supported ? 'text-emerald-500' : 'text-rose-500'}>•</span>
            Suporte do navegador: {state.supported ? 'OK' : 'Indisponível (use iOS 16.4+ ou Android com PWA instalada)'}
          </li>
          <li className="flex items-center gap-1.5">
            <span className={state.permission === 'granted' ? 'text-emerald-500' : state.permission === 'denied' ? 'text-rose-500' : 'text-[var(--muted)]'}>•</span>
            Permissão: {state.permission === 'granted' ? 'concedida' : state.permission === 'denied' ? 'negada (habilite nas configurações do navegador)' : 'ainda não solicitada'}
          </li>
          <li className="flex items-center gap-1.5">
            <span className={state.backendConfigured ? 'text-emerald-500' : 'text-rose-500'}>•</span>
            Servidor: {state.backendConfigured ? 'pronto' : 'não configurado (avise o admin)'}
          </li>
        </ul>

        {state.error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          {state.subscribed ? (
            <button
              type="button"
              onClick={() => void disable()}
              disabled={state.loading}
              className="rounded-lg border border-[var(--line)] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.loading ? 'Desativando…' : 'Desativar notificações'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={state.loading || !state.supported || state.permission === 'denied' || !state.backendConfigured}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.loading ? 'Carregando…' : 'Ativar notificações'}
            </button>
          )}
        </div>
      </div>

      {/* Toggles granulares — visíveis sempre, mas só viram push quando
          o user tem subscribed=true. Caso contrário só governam o sininho
          in-app. Carrega/edita via /notifications/preferences. */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-[var(--text)]">O que você recebe</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
          Desligue categorias específicas se elas estiverem incomodando. Vale tanto pro sininho do app quanto pro push do celular.
        </p>

        {prefsLoading && (
          <p className="mt-3 text-[12px] text-[var(--muted)]">Carregando preferências…</p>
        )}

        {prefsError && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">
            {prefsError}
          </p>
        )}

        {prefs && !prefsLoading && (
          <div className="mt-4 space-y-1">
            {(
              [
                {
                  key: 'pushSocial' as const,
                  title: 'Social',
                  desc: 'Curtidas, comentários e novos seguidores',
                },
                {
                  key: 'pushCompetition' as const,
                  title: 'Competições',
                  desc: 'Convites, início, fim, ranking e ultrapassagens',
                },
                {
                  key: 'pushSupport' as const,
                  title: 'Suporte e moderação',
                  desc: 'Respostas em tickets e avisos sobre seus posts',
                },
                {
                  key: 'pushEngagement' as const,
                  title: 'Engajamento',
                  desc: 'Streak em risco, saudades, resumo semanal e aniversário',
                },
              ]
            ).map(({ key, title, desc }) => {
              const value = prefs[key]
              const isPending = pendingKey === key
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)] ${
                    isPending ? 'opacity-60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--text)]">{title}</p>
                    <p className="text-[11px] text-[var(--muted)]">{desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={value}
                    disabled={isPending}
                    onChange={(e) => { void togglePref(key, e.target.checked) }}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--brand)]"
                  />
                </label>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-[var(--line)] p-4">
        <p className="text-[12px] font-bold text-[var(--text)]">Como funciona</p>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-[var(--muted)]">
          <li>• Cada vez que você marca uma série e o descanso começa, agendamos a notificação no servidor.</li>
          <li>• Pode trocar de app, travar o celular ou fechar o navegador — quando o descanso acabar, chega notificação.</li>
          <li>• Toque na notificação pra voltar direto pro treino.</li>
          <li>• Quando você para o descanso no meio (ou pula a série), a notificação é cancelada automaticamente.</li>
          <li>• <strong>iPhone</strong>: a notificação só funciona com o app instalado pela tela inicial (Compartilhar → Adicionar à Tela de Início) e iOS 16.4 ou mais novo.</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Training Profile Panel ───────────────────────────────────────────────
// Edita os campos do perfil profissional definidos no onboarding v2:
// altura, peso atual, nível de experiência, objetivo principal e
// dias por semana. Cada bloco salva independente via PATCH /auth/profile
// (partial update). Mudanças pré-preenchem o quiz da IA automaticamente
// na próxima geração de plano.
const EXPERIENCE_LABELS_PT: Record<ExperienceLevel, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
}
const GOAL_LABELS_PT: Record<PrimaryGoal, string> = {
  STRENGTH: 'Força',
  HYPERTROPHY: 'Hipertrofia',
  WEIGHT_LOSS: 'Emagrecimento',
  ENDURANCE: 'Resistência',
  GENERAL_FITNESS: 'Saúde geral',
}

function TrainingProfilePanel({
  authorizedFetch, applyUserPatch, user,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<AuthUser>) => void
  user: AuthUser | null
}) {
  // Estado local "draft" pra cada campo. Inicializa do user; quando muda
  // (login em outra aba, refresh), useEffect re-sincroniza.
  const [heightCm, setHeightCm] = useState<string>(user?.heightCm != null ? String(user.heightCm) : '')
  const [weightKg, setWeightKg] = useState<string>(user?.weightKg != null ? String(user.weightKg) : '')
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(user?.experienceLevel ?? null)
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(user?.primaryGoal ?? null)
  const [daysPerWeek, setDaysPerWeek] = useState<number>(user?.availableDaysPerWeek ?? 4)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedField, setSavedField] = useState<string | null>(null)

  useEffect(() => {
    setHeightCm(user?.heightCm != null ? String(user.heightCm) : '')
    setWeightKg(user?.weightKg != null ? String(user.weightKg) : '')
    setExperienceLevel(user?.experienceLevel ?? null)
    setPrimaryGoal(user?.primaryGoal ?? null)
    setDaysPerWeek(user?.availableDaysPerWeek ?? 4)
  }, [user?.heightCm, user?.weightKg, user?.experienceLevel, user?.primaryGoal, user?.availableDaysPerWeek])

  // Helper genérico de save — recebe o patch a aplicar, faz fetch, refresca
  // estado local da sessão e marca o feedback visual.
  const savePatch = async (patch: Parameters<typeof updateProfileFields>[1], fieldLabel: string): Promise<void> => {
    setSaving(true)
    setError(null)
    setSavedField(null)
    try {
      const updated = await updateProfileFields(authorizedFetch, patch)
      applyUserPatch(updated)
      setSavedField(fieldLabel)
      window.setTimeout(() => setSavedField(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const saveHeight = async (): Promise<void> => {
    const trimmed = heightCm.trim()
    if (trimmed === '') return savePatch({ heightCm: null }, 'altura')
    const v = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(v) || v < 100 || v > 250) {
      setError('Altura inválida (entre 100 e 250 cm).')
      return
    }
    return savePatch({ heightCm: v }, 'altura')
  }

  const saveWeight = async (): Promise<void> => {
    const trimmed = weightKg.trim()
    if (trimmed === '') return savePatch({ weightKg: null }, 'peso')
    const v = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(v) || v < 25 || v > 300) {
      setError('Peso inválido (entre 25 e 300 kg).')
      return
    }
    return savePatch({ weightKg: v }, 'peso')
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Perfil de treino</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Essas informações pré-preenchem o quiz da IA e personalizam recomendações. Pode atualizar quando precisar.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">{error}</p>
      )}
      {savedField && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-500">
          {savedField} salvo ✓
        </p>
      )}

      {/* Altura */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Altura (cm)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="Ex.: 175"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void saveHeight()}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Peso */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Peso atual (kg)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            placeholder="Ex.: 72"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={() => void saveWeight()}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Você também pode registrar peso na página de Progresso, com data e foto.
        </p>
      </div>

      {/* Nível de experiência */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Nível de experiência</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(EXPERIENCE_LABELS_PT) as ExperienceLevel[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setExperienceLevel(opt)
                void savePatch({ experienceLevel: opt }, 'experiência')
              }}
              disabled={saving}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                experienceLevel === opt
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                  : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]/40'
              } disabled:opacity-50`}
            >
              {EXPERIENCE_LABELS_PT[opt]}
            </button>
          ))}
        </div>
      </div>

      {/* Objetivo principal */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Objetivo principal</label>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(GOAL_LABELS_PT) as PrimaryGoal[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setPrimaryGoal(opt)
                void savePatch({ primaryGoal: opt }, 'objetivo')
              }}
              disabled={saving}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                primaryGoal === opt
                  ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                  : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]/40'
              } disabled:opacity-50`}
            >
              {GOAL_LABELS_PT[opt]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Pode ser ajustado por plano específico no quiz da IA.
        </p>
      </div>

      {/* Dias por semana */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
        <label className="block text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">Dias disponíveis por semana</label>
        <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <input
            type="range"
            min={1}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
            onMouseUp={() => void savePatch({ availableDaysPerWeek: daysPerWeek }, 'dias')}
            onTouchEnd={() => void savePatch({ availableDaysPerWeek: daysPerWeek }, 'dias')}
            className="w-full"
            disabled={saving}
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-2xl font-black text-[var(--text)]">{daysPerWeek} dias</p>
            <p className="text-xs text-[var(--muted)]">Salvo ao soltar o slider</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plan Panel ───────────────────────────────────────────────────────────
// Mostra o tier atual + uso/limites por feature + campo "Tenho um convite"
// pra colar o token. Em FREE, exibe CTA "Em breve com plano pago" como
// placeholder pro futuro checkout.
const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  workoutPlans: 'Rotinas',
  aiGenerations: 'Gerações de IA',
  aiHistoryEntries: 'Histórico de IA',
  customExercises: 'Exercícios personalizados',
  competitionsOwned: 'Competições como dono',
  pinnedExercises: 'Exercícios fixados',
}

function PlanPanel({
  authorizedFetch, refreshUser, user,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  refreshUser: () => Promise<void>
  user: AuthUser | null
}) {
  const [summary, setSummary] = useState<PlanSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteToken, setInviteToken] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getPlanSummary(authorizedFetch)
      setSummary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar plano')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])

  const handleRedeem = async () => {
    const trimmed = inviteToken.trim()
    if (trimmed.length < 8) {
      setRedeemMsg({ type: 'error', text: 'Token muito curto — confirme o que você colou.' })
      return
    }
    // Aceita tanto token puro quanto URL completa — extrai o último segmento.
    const token = trimmed.includes('/') ? trimmed.split('/').filter(Boolean).pop() ?? trimmed : trimmed
    setRedeeming(true)
    setRedeemMsg(null)
    try {
      await redeemProInvite(authorizedFetch, token)
      await refreshUser()
      await load()
      setInviteToken('')
      setRedeemMsg({ type: 'success', text: '✨ Você agora é PRO! Todos os limites foram liberados.' })
    } catch (err) {
      setRedeemMsg({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao resgatar convite' })
    } finally {
      setRedeeming(false)
    }
  }

  const effectivePlan = user?.plan ?? 'FREE'
  const isPro = effectivePlan === 'PRO'

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-bold text-[var(--text)]">Plano</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
          Veja o seu tier atual, o quanto já usou de cada feature e como liberar mais recursos.
        </p>
      </header>

      {/* Card do tier atual */}
      <div className={`relative overflow-hidden rounded-xl border p-5 ${isPro ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-[var(--brand)]/10' : 'border-[var(--line)] bg-[var(--surface-hover)]'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown size={18} className={isPro ? 'text-amber-500' : 'text-[var(--muted)]'} />
            <span className="text-[15px] font-bold text-[var(--text)]">
              {isPro ? 'Plano PRO' : 'Plano grátis'}
            </span>
          </div>
          {isPro && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Ativo
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
          {isPro
            ? 'Você tem acesso a todas as features sem limite.'
            : 'O plano grátis tem limites em algumas features. Faça upgrade pra PRO pra liberar tudo.'}
        </p>
      </div>

      {/* Uso / limites */}
      {loading && (
        <p className="text-[12px] text-[var(--muted)]">Carregando uso atual…</p>
      )}
      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-500">{error}</p>
      )}
      {summary && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Uso atual</p>
          <ul className="overflow-hidden rounded-xl border border-[var(--line)]">
            {(Object.keys(FEATURE_LABELS) as PlanFeatureKey[]).map((key, idx) => {
              const used = summary.usage[key]
              const limit = summary.limits[key]
              const unlimited = limit === null
              const atLimit = !unlimited && used >= limit
              return (
                <li
                  key={key}
                  className={`flex items-center justify-between gap-2 bg-[var(--surface)] px-4 py-3 ${idx < Object.keys(FEATURE_LABELS).length - 1 ? 'border-b border-[var(--line)]' : ''}`}
                >
                  <span className="text-[13px] text-[var(--text)]">{FEATURE_LABELS[key]}</span>
                  <span className={`text-[12px] font-bold tabular-nums ${atLimit ? 'text-rose-500' : 'text-[var(--muted)]'}`}>
                    {used}{unlimited ? ' / ∞' : ` / ${limit}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Convite — só pra free */}
      {!isPro && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-4">
          <p className="text-[13px] font-bold text-[var(--text)]">Tem um convite?</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Cole o link completo ou só o token recebido pra fazer upgrade gratuito pro PRO.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              placeholder="abc123… ou link completo"
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
            />
            <button
              type="button"
              onClick={() => void handleRedeem()}
              disabled={redeeming || inviteToken.trim().length === 0}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
            >
              {redeeming ? 'Resgatando…' : 'Resgatar'}
            </button>
          </div>
          {redeemMsg && (
            <p
              className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                redeemMsg.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500'
                  : 'border-rose-500/30 bg-rose-500/5 text-rose-500'
              }`}
            >
              {redeemMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Benefícios PRO */}
      {!isPro && (
        <div className="rounded-xl border border-[var(--line)] p-4">
          <p className="flex items-center gap-2 text-[13px] font-bold text-[var(--text)]">
            <Sparkles size={14} className="text-[var(--brand)]" />
            O que muda no PRO
          </p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Gerações de IA <strong>ilimitadas</strong> (FREE = 3 totais)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              <strong>Rotinas e exercícios sem limite</strong>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Histórico de IA mais longo (50 gerações)
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              Mais exercícios fixados na Progress (até 20)
            </li>
          </ul>
          <p className="mt-3 text-[11px] italic text-[var(--muted)]">
            Em breve: plano PRO pago direto pelo app. Por enquanto, só com convite de admin.
          </p>
        </div>
      )}
    </div>
  )
}

