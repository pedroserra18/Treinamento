import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Share, Plus, X } from 'lucide-react'
import {
  isStandalone,
  isIosSafari,
  isSnoozed,
  snoozeForDays,
  getVisitCount,
  type BeforeInstallPromptEvent,
} from '../../lib/install-prompt'

// Banner inteligente que oferece a instalação do PWA. Comportamento:
//
//   • Esconde sempre se: já instalado (standalone), snoozed nos
//     últimos 7 dias, ou < 2 visitas (sinal "esse não vai voltar")
//   • Android (Chromium): escuta beforeinstallprompt e mostra
//     "Instalar app" — 1 tap dispara o modal nativo do Chrome
//   • iOS Safari: sem API → tutorial visual em 3 passos
//   • Outros (iOS Firefox/Chrome, desktop sem API): silencioso
//
// Estilo: barra no rodapé, dismissível, não interrompe o conteúdo.
export function PwaInstallBanner() {
  const [variant, setVariant] = useState<'android' | 'ios-tutorial' | null>(null)
  const [iosTutorialOpen, setIosTutorialOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Defesa em camadas: só mostra se atende todos critérios.
    if (typeof window === 'undefined') return
    if (isStandalone()) return

    // Atalho de testes: ?install=force bypassa snooze + visit count.
    // Útil pra QA / primeira validação. Sem isso, snooze de 7 dias
    // efetivamente esconde o banner durante teste.
    const forced = new URLSearchParams(window.location.search).has('install')
    if (!forced) {
      if (isSnoozed()) return
      // Threshold = 1 (mostra na primeira visita já). Era 2 mas
      // adia demais a descoberta da feature; com snooze de 7 dias
      // se o usuário fechar, não fica invasivo.
      if (getVisitCount() < 1) return
    }

    // Android: aguarda o evento beforeinstallprompt do Chrome.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVariant('android')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS: sem API, decidimos com base no UA. Mostra após 1.5s pra
    // não competir com o carregamento inicial da página.
    let iosTimer: number | undefined
    if (isIosSafari()) {
      iosTimer = window.setTimeout(() => setVariant('ios-tutorial'), 1500)
    }

    // Quando o app é instalado (qualquer plataforma), Chrome dispara
    // 'appinstalled'. Esconde o banner imediato.
    const onInstalled = () => {
      setVariant(null)
      snoozeForDays(365) // efetivamente "nunca mais"
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, [])

  if (!variant) return null

  const handleDismiss = () => {
    snoozeForDays(7)
    setVariant(null)
  }

  return (
    <>
      <AnimatePresence>
        {variant && (
          <motion.div
            key="pwa-install"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            // Posicionamento: acima da bottom nav (~76px no mobile)
            // pra não competir. z-index abaixo dos dialogs (90) e
            // modals (80) mas acima da nav (20).
            className="fixed inset-x-3 bottom-24 z-[40] mx-auto max-w-md rounded-2xl border border-[var(--brand)]/40 bg-[var(--surface)] p-3 shadow-2xl lg:bottom-3"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
                <Download size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[var(--text)]">
                  Instalar SerraAthlo
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  Treine sem abrir o navegador, mais rápido.
                </p>
              </div>
              {variant === 'android' && deferredPrompt && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deferredPrompt.prompt()
                      const choice = await deferredPrompt.userChoice
                      if (choice.outcome === 'dismissed') {
                        snoozeForDays(7)
                      }
                      // De qualquer modo, esconde o banner (o appinstalled
                      // handler fará o cleanup definitivo se aceito).
                      setDeferredPrompt(null)
                      setVariant(null)
                    } catch {
                      setVariant(null)
                    }
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-2 text-[12px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
                >
                  Instalar
                </button>
              )}
              {variant === 'ios-tutorial' && (
                <button
                  type="button"
                  onClick={() => setIosTutorialOpen(true)}
                  style={{ touchAction: 'manipulation' }}
                  className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-2 text-[12px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
                >
                  Ver como
                </button>
              )}
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Fechar"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tutorial overlay iOS — passos visuais pra adicionar à tela
          inicial. Aparece quando o usuário toca em "Ver como". */}
      <AnimatePresence>
        {iosTutorialOpen && (
          <motion.div
            key="ios-tutorial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setIosTutorialOpen(false)}
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-tutorial-title"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
            >
              <div className="p-5">
                <h2 id="ios-tutorial-title" className="text-[16px] font-bold text-[var(--text)]">
                  Adicione à sua tela inicial
                </h2>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  Em 3 passos rápidos, o SerraAthlo vira app no seu iPhone.
                </p>

                <ol className="mt-4 space-y-3.5">
                  <li className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-white">
                      1
                    </span>
                    <p className="text-[13px] text-[var(--text)]">
                      Toque no botão{' '}
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-1.5 py-0.5 align-middle font-semibold">
                        <Share size={12} className="text-[var(--brand)]" />
                        Compartilhar
                      </span>{' '}
                      lá embaixo do Safari.
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-white">
                      2
                    </span>
                    <p className="text-[13px] text-[var(--text)]">
                      Role e escolha{' '}
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-1.5 py-0.5 align-middle font-semibold">
                        <Plus size={12} className="text-[var(--brand)]" />
                        Adicionar à Tela de Início
                      </span>
                    </p>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-white">
                      3
                    </span>
                    <p className="text-[13px] text-[var(--text)]">
                      Toque em <b className="text-[var(--brand)]">Adicionar</b> no canto superior direito.
                    </p>
                  </li>
                </ol>

                <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-2.5 text-[11px] text-[var(--muted)]">
                  💡 Depois disso, o ícone <b className="text-[var(--text)]">SerraAthlo</b> vai aparecer
                  na sua tela inicial igual aos outros apps. Abra por lá pra ficar em tela cheia.
                </p>
              </div>

              <div className="flex gap-2 border-t border-[var(--line)] p-3">
                <button
                  type="button"
                  onClick={() => {
                    snoozeForDays(7)
                    setIosTutorialOpen(false)
                    setVariant(null)
                  }}
                  className="flex-1 rounded-xl border border-[var(--line)] py-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  Lembrar depois
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // O usuário clicou em "Já adicionei" — assumimos
                    // que vai instalar agora ou já instalou. Snooze
                    // longo (1 ano) pra não voltar a aparecer.
                    snoozeForDays(365)
                    setIosTutorialOpen(false)
                    setVariant(null)
                  }}
                  style={{ touchAction: 'manipulation' }}
                  className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
                >
                  Já adicionei
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
