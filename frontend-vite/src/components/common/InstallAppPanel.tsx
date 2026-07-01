import { useEffect, useState } from 'react'
import { Smartphone, Share, Plus, Download, Check, MoreVertical } from 'lucide-react'
import {
  isAndroidChromium,
  isIosSafari,
  isStandalone,
  type BeforeInstallPromptEvent,
} from '../../lib/infra/install-prompt'

// Painel completo de instalação na seção Configurações > Instalar app.
//
// Lógica de exibição:
//   • Se já está instalado (display-mode: standalone) → confirma com
//     check verde "App instalado"
//   • Senão, mostra abas (iOS / Android / Computador) com a aba
//     pré-selecionada pelo UA do usuário
//   • Android tem botão "Instalar agora" funcional (usa o evento
//     beforeinstallprompt capturado no boot da app)
//   • iOS e Computador (Safari macOS sem prompt API) mostram tutorial
//     visual passo a passo
//
// É a versão "definitiva" do install — sempre acessível via
// /settings?section=install, mesmo se o usuário deu dismiss no banner.
export function InstallAppPanel() {
  type Tab = 'ios' | 'android' | 'desktop'

  // Aba inicial baseada no aparelho detectado. Usuário pode trocar
  // manualmente (ex.: ver instruções de iPhone estando no PC pra
  // depois reproduzir no celular).
  const initialTab: Tab = isIosSafari()
    ? 'ios'
    : isAndroidChromium()
      ? 'android'
      : 'desktop'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [installed, setInstalled] = useState(false)
  const [androidPrompt, setAndroidPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setInstalled(isStandalone())

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setAndroidPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setAndroidPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) {
    return (
      <div className="space-y-4">
        <h2 className="text-[18px] font-bold text-[var(--text)]">Instalar app</h2>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
              <Check size={18} strokeWidth={3} />
            </span>
            <div>
              <p className="text-[15px] font-bold text-emerald-600">App já instalado</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                Você está usando o SerraAthlo como aplicativo. Pra abrir, toque no ícone na tela inicial.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ios', label: 'iPhone' },
    { id: 'android', label: 'Android' },
    { id: 'desktop', label: 'Computador' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-bold text-[var(--text)]">Instalar app</h2>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Transforme o SerraAthlo em aplicativo: ícone na tela inicial, sem barra do navegador, funciona offline.
        </p>
      </div>

      {/* Tabs por plataforma. A do dispositivo atual fica pré-selecionada. */}
      <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors ${
                active
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
              {initialTab === t.id && !active && (
                <span className="ml-1.5 text-[10px] text-[var(--brand)]">·</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ───────── iOS ───────── */}
      {tab === 'ios' && (
        <article className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-[12px] font-mono uppercase tracking-wider text-[var(--muted)]">
            <Smartphone size={13} />
            iPhone / iPad
          </div>
          <p className="text-[13px] text-[var(--text)]">
            No iPhone, a instalação é manual em 3 passos pelo Safari. <b>Outros navegadores no iOS (Chrome, Firefox) não funcionam</b> — use o Safari.
          </p>

          <ol className="space-y-3">
            <Step
              number={1}
              icon={<Share size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  Abra o site no <b>Safari</b> e toque no botão <b>Compartilhar</b> (□↑) — no iPhone fica na barra de baixo, no iPad fica em cima.
                </>
              }
            />
            <Step
              number={2}
              icon={<Plus size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  Role pra baixo no menu e escolha <b>"Adicionar à Tela de Início"</b>.
                </>
              }
            />
            <Step
              number={3}
              icon={<Check size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  Confirme tocando em <b>"Adicionar"</b> no canto superior direito.
                </>
              }
            />
          </ol>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
            <p className="text-[12px] font-semibold text-[var(--text)]">💡 Pronto!</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              O ícone <b className="text-[var(--text)]">SerraAthlo</b> agora aparece na sua tela inicial, igual qualquer outro app. Abra por lá pra ficar em tela cheia.
            </p>
          </div>

          {!isIosSafari() && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-600">
              Você não está num iPhone com Safari agora. Abra este site no Safari do seu iPhone pra seguir os passos.
            </p>
          )}
        </article>
      )}

      {/* ───────── Android ───────── */}
      {tab === 'android' && (
        <article className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-[12px] font-mono uppercase tracking-wider text-[var(--muted)]">
            <Smartphone size={13} />
            Android
          </div>

          {androidPrompt ? (
            <>
              <p className="text-[13px] text-[var(--text)]">
                Seu navegador suporta instalação direta. Toque no botão abaixo pra instalar agora.
              </p>
              <button
                type="button"
                disabled={installing}
                onClick={async () => {
                  if (!androidPrompt) return
                  setInstalling(true)
                  try {
                    await androidPrompt.prompt()
                    const choice = await androidPrompt.userChoice
                    if (choice.outcome === 'accepted') {
                      setInstalled(true)
                    }
                  } finally {
                    setInstalling(false)
                    setAndroidPrompt(null)
                  }
                }}
                style={{ touchAction: 'manipulation' }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-60"
              >
                <Download size={16} />
                {installing ? 'Instalando…' : 'Instalar SerraAthlo'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-[var(--text)]">
                Se você está no Android pelo Chrome ou Edge, siga os passos abaixo (o botão automático aparece após navegar um pouco no site).
              </p>
              <ol className="space-y-3">
                <Step
                  number={1}
                  icon={<MoreVertical size={14} className="text-[var(--brand)]" />}
                  text={
                    <>
                      Toque no menu <b>⋮</b> no canto superior direito do Chrome.
                    </>
                  }
                />
                <Step
                  number={2}
                  icon={<Download size={14} className="text-[var(--brand)]" />}
                  text={
                    <>
                      Escolha <b>"Instalar app"</b> ou <b>"Adicionar à tela inicial"</b>.
                    </>
                  }
                />
                <Step
                  number={3}
                  icon={<Check size={14} className="text-[var(--brand)]" />}
                  text={
                    <>
                      Confirme tocando em <b>"Instalar"</b>.
                    </>
                  }
                />
              </ol>
            </>
          )}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
            <p className="text-[12px] font-semibold text-[var(--text)]">💡 Pronto!</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              O ícone vai aparecer na gaveta de apps. No Android, o SerraAthlo recebe notificações push se você ativar nas configurações do app.
            </p>
          </div>
        </article>
      )}

      {/* ───────── Desktop ───────── */}
      {tab === 'desktop' && (
        <article className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 text-[12px] font-mono uppercase tracking-wider text-[var(--muted)]">
            <Download size={13} />
            Computador
          </div>
          <p className="text-[13px] text-[var(--text)]">
            No Chrome, Edge ou Brave (Windows, Mac e Linux): instala em 1 clique e vira app desktop separado.
          </p>

          <ol className="space-y-3">
            <Step
              number={1}
              icon={<Download size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  Procure o ícone de <b>instalação</b> na barra de endereço (lado direito da URL).
                </>
              }
            />
            <Step
              number={2}
              icon={<Check size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  Clique nele e em seguida em <b>"Instalar"</b> no modal que aparecer.
                </>
              }
            />
            <Step
              number={3}
              icon={<Smartphone size={14} className="text-[var(--brand)]" />}
              text={
                <>
                  O SerraAthlo abre em uma <b>janela separada</b>, e você pode abrir pelo menu Iniciar / Launchpad / Activities.
                </>
              }
            />
          </ol>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
            <p className="text-[12px] font-semibold text-[var(--text)]">💡 No Safari (macOS)</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Vá em <b>Arquivo → Adicionar ao Dock</b>. Disponível no Safari 17 ou mais novo (macOS Sonoma+).
            </p>
          </div>
        </article>
      )}
    </div>
  )
}

// Item numerado do passo a passo. Compartilhado pelos 3 tabs pra
// manter o visual consistente.
function Step({
  number, icon, text,
}: {
  number: number
  icon: React.ReactNode
  text: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-white">
        {number}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-[13px] leading-relaxed text-[var(--text)]">
        <span className="inline-flex items-center gap-1.5">{icon}</span>{' '}
        {text}
      </div>
    </li>
  )
}
