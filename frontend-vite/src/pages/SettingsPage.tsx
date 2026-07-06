import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import {
  AtSign, Download, Lock, LogOut, Moon, ShieldAlert,
  AlertTriangle, LifeBuoy, ArrowLeft, Smartphone, Dumbbell, Bell, Activity, Crown,
  Shield, Info,
} from 'lucide-react'
import { InstallAppPanel } from '../components/common/InstallAppPanel'
import { NotificationsPanel } from './settings/NotificationsPanel'
import { MyExercisesPanel, TrainingProfilePanel, PlanPanel } from './settings/training-panels'
import { ProfilePanel, AccountPanel, HandlePanel } from './settings/account-panels'
import {
  PrivacyPanel, ThemePanel, ExportPanel, SupportPanel,
  AboutPanel, AdminToolsPanel, LogoutPanel, DeletePanel,
} from './settings/misc-panels'

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

