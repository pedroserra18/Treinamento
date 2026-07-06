import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../../services/pushService'

// ─── Notifications Panel ──────────────────────────────────────────────────
// Controla o opt-in de push notifications. Mostra estado atual (suportado /
// permitido / inscrito / backend configurado) com mensagens diretas pra o
// usuário saber EXATAMENTE o que precisa fazer pra ativar. O hook
// usePushNotifications cuida do fluxo de subscribe/unsubscribe; aqui só
// renderizamos botão de ação contextual.
export function NotificationsPanel() {
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
