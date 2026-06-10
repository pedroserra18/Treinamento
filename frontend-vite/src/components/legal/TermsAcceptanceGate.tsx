import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Crown, FileText, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { CURRENT_TERMS_VERSION } from '../../lib/terms-version'

// Gate de re-aceite — wrappa o app autenticado. Quando o user está logado
// e:
//   • nunca aceitou termos (acceptedTermsAt == null), OU
//   • aceitou uma versão antiga (acceptedTermsVersion !== CURRENT_TERMS_VERSION)
// renderiza um modal bloqueante explicando a atualização e exigindo aceite
// antes de seguir usando o app.
//
// O gate NÃO renderiza quando o user está nas próprias páginas legais
// (/termos, /privacidade) — senão o modal cobriria o documento que ele
// precisa ler pra aceitar. Em vez disso, mostra um banner sticky no topo
// das páginas com botão "Voltar ao aceite".
//
// Logout é a única saída alternativa — pessoa que se recuse pode sair, mas
// não consegue continuar usando recursos do app sem aceitar.

// Rotas onde o gate NÃO renderiza o overlay (pra deixar a pessoa ler antes
// de aceitar). startsWith pra cobrir variações com query string ou hash.
const LEGAL_ROUTES = ['/termos', '/privacidade']

export function TermsAcceptanceGate({ children }: { children: ReactNode }) {
  const { user, ready, isAuthenticated, acceptTerms, logout } = useAuth()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Aguarda o boot do AuthContext concluir pra não piscar o gate antes do
  // /auth/profile responder.
  if (!ready) return <>{children}</>

  // Não bloqueia rotas públicas (login/register/pro-invite/termos/privacidade)
  // — o gate só faz sentido quando há sessão autenticada. Quem nunca logou
  // pode navegar livre nas páginas públicas, e quem está em /termos pra
  // ler antes de aceitar não tem o gate cobrindo o documento.
  if (!isAuthenticated || !user) return <>{children}</>

  const accepted = user.acceptedTermsVersion === CURRENT_TERMS_VERSION
  if (accepted) return <>{children}</>

  // Pessoa pediu pra ler os documentos antes de aceitar — solta o overlay
  // mas mostra um banner sticky pra ela voltar quando terminar.
  const inLegalPage = LEGAL_ROUTES.some((path) => location.pathname.startsWith(path))
  if (inLegalPage) {
    return (
      <>
        {/* Banner sticky no topo durante leitura — link de volta pra continuar
            o fluxo de aceite. Z alto pra ficar acima do conteúdo da página. */}
        <div className="sticky top-0 z-[8000] border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5 backdrop-blur-md pt-safe-plus-2">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-[11.5px] font-semibold leading-snug text-[var(--text)]">
              Aceite pendente — feche esta aba ou volte pra continuar
            </p>
            <Link
              to="/"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--brand)] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[var(--brand-strong)]"
            >
              <ArrowLeft size={11} />
              Voltar
            </Link>
          </div>
        </div>
        {children}
      </>
    )
  }

  const isFirstAcceptance = user.acceptedTermsAt === null

  const handleAccept = async () => {
    setLoading(true)
    setError(null)
    try {
      await acceptTerms(CURRENT_TERMS_VERSION)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar aceite')
    } finally {
      setLoading(false)
    }
  }

  const handleDecline = async () => {
    if (loading) return
    setLoading(true)
    try {
      await logout()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {children}
      {/* Overlay bloqueante — z muito alto pra ficar acima de toasts, dialogs
          e qualquer outra UI de runtime. */}
      <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/70 p-4 backdrop-blur-md sm:items-center">
        <div className="relative w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-2xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-25 blur-3xl"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />

          <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-[var(--brand)]/25">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--brand)]/15">
              {isFirstAcceptance ? <ShieldCheck size={22} className="text-[var(--brand)]" /> : <Crown size={22} className="text-[var(--brand)]" />}
            </div>
          </div>

          <h2 className="relative text-center text-xl font-black tracking-tight text-[var(--text)]">
            {isFirstAcceptance ? 'Bem-vindo de volta' : 'Atualizamos nossos termos'}
          </h2>
          <p className="relative mt-2 text-center text-[13px] leading-relaxed text-[var(--muted)]">
            {isFirstAcceptance ? (
              <>
                Pra continuar usando o SerraAthlo, precisamos do seu aceite dos
                Termos de Uso e Política de Privacidade. Leia com calma e confirme.
              </>
            ) : (
              <>
                Nossos Termos de Uso e Política de Privacidade foram atualizados pra
                versão <strong className="text-[var(--text)]">{CURRENT_TERMS_VERSION}</strong>.
                Pra continuar usando o app, precisamos do seu aceite da nova versão.
              </>
            )}
          </p>

          <div className="relative mt-5 space-y-2">
            {/* Sem target=_blank: no PWA standalone iOS, abas externas saem
                do app inteiro e quebram o fluxo. Navegação dentro da mesma
                janela; o gate detecta /termos e /privacidade e libera o
                overlay (com banner sticky no topo pra lembrar do aceite). */}
            <Link
              to="/termos"
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3 transition-colors hover:bg-[var(--surface)]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                <FileText size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[var(--text)]">Termos de Uso</span>
                <span className="block text-[10.5px] text-[var(--muted)]">Regras, planos, IA, foro</span>
              </span>
            </Link>
            <Link
              to="/privacidade"
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3 transition-colors hover:bg-[var(--surface)]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldCheck size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-[var(--text)]">Política de Privacidade</span>
                <span className="block text-[10.5px] text-[var(--muted)]">Dados, LGPD, seus direitos</span>
              </span>
            </Link>
          </div>

          {error ? (
            <p className="relative mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11.5px] text-rose-500">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={loading}
            className="relative mt-5 w-full rounded-xl bg-gradient-to-r from-[var(--brand)] to-amber-500 py-3 text-[13.5px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(255,90,60,0.65)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? 'Registrando aceite…' : 'Li e aceito ambos'}
          </button>

          <button
            type="button"
            onClick={() => void handleDecline()}
            disabled={loading}
            className="relative mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-60"
          >
            <X size={12} />
            Não aceitar e sair
          </button>

          <p className="relative mt-3 text-center text-[10.5px] text-[var(--muted)]">
            Versão {CURRENT_TERMS_VERSION} · O aceite fica registrado na sua conta.
          </p>
        </div>
      </div>
    </>
  )
}
