import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Crown, Sparkles, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import {
  previewProInvite,
  redeemProInvite,
  type ProInvitePreview,
} from '../../services/subscriptionService'

// Página pública /pro-invite/:token. Mostra detalhes do convite e
// permite resgatar. Comportamento varia por estado de auth:
//   • Não logado + válido → CTA "Entrar / Criar conta" preserva token
//   • Logado + válido → CTA "Resgatar agora" faz o POST
//   • Inválido (usado/expirado/revogado/inexistente) → mensagem clara
//   • Já é PRO → 409 do backend, mostra "Você já é PRO"
//
// Token sobrevive navegação via sessionStorage caso o user precise
// logar/cadastrar — quando voltar, o login flow lê e redime auto.
const STORAGE_KEY = 'serraathlo:pendingProInvite'

export function ProInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, ready, authorizedFetch, refreshUser } = useAuth()

  const [preview, setPreview] = useState<ProInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setPreviewError('Convite inválido — link sem token.')
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const data = await previewProInvite(token)
        if (!cancelled) setPreview(data)
      } catch (err) {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Erro ao validar convite')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) {
    return <Navigate to="/" replace />
  }
  if (!ready) {
    return (
      <section className="mx-auto max-w-md p-6">
        <p className="text-center text-[13px] text-[var(--muted)]">Validando…</p>
      </section>
    )
  }

  const handleRedeem = async (): Promise<void> => {
    if (!token) return
    setRedeeming(true)
    setRedeemError(null)
    try {
      await redeemProInvite(authorizedFetch, token)
      await refreshUser()
      sessionStorage.removeItem(STORAGE_KEY)
      setRedeemed(true)
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Erro ao resgatar convite')
    } finally {
      setRedeeming(false)
    }
  }

  const handleLoginToRedeem = (): void => {
    // Persiste o token pra o auth flow consumir depois do login/registro.
    sessionStorage.setItem(STORAGE_KEY, token)
    navigate('/login?next=/pro-invite/' + token)
  }

  const handleRegisterToRedeem = (): void => {
    sessionStorage.setItem(STORAGE_KEY, token)
    navigate('/register?next=/pro-invite/' + token)
  }

  return (
    <section className="mx-auto max-w-md p-4">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />

        <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/25 to-[var(--brand)]/25">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-[var(--brand)]/15">
            <Crown size={28} className="text-[var(--brand)]" />
          </div>
        </div>

        <h1 className="relative text-2xl font-black text-[var(--text)]">Convite PRO</h1>

        {loading && (
          <p className="mt-4 text-[13px] text-[var(--muted)]">Validando convite…</p>
        )}

        {previewError && !loading && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-[12px] text-rose-500">{previewError}</p>
          </div>
        )}

        {!loading && preview && !previewError && (
          <>
            {/* Convite INVÁLIDO — usado/revogado/expirado/inexistente */}
            {!preview.valid && (
              <>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-500">
                  <AlertTriangle size={12} />
                  Convite indisponível
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-[var(--muted)]">
                  {preview.reason === 'USED' && 'Este convite já foi resgatado por outra pessoa.'}
                  {preview.reason === 'REVOKED' && 'Este convite foi revogado por quem o criou.'}
                  {preview.reason === 'EXPIRED' && 'Este convite expirou.'}
                  {preview.reason === 'NOT_FOUND' && 'Convite não encontrado — confira o link.'}
                </p>
                {preview.createdByName && (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Convite criado por {preview.createdByName}
                  </p>
                )}
              </>
            )}

            {/* Convite VÁLIDO — fluxo de redeem */}
            {preview.valid && !redeemed && (
              <>
                <p className="mt-4 text-[13px] leading-relaxed text-[var(--text)]">
                  Você foi convidado pra <strong>upgrade gratuito pro plano PRO</strong>.
                </p>
                {preview.createdByName && (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Convite de <strong>{preview.createdByName}</strong>
                    {preview.note && ` — "${preview.note}"`}
                  </p>
                )}

                <ul className="mt-5 space-y-2 text-left text-[12px] text-[var(--muted)]">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    Gerações de IA ilimitadas
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    Rotinas e exercícios personalizados sem limite
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    Histórico de IA mais longo (50 gerações)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                    Mais exercícios fixados na Progress
                  </li>
                </ul>

                {redeemError && (
                  <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                    <p className="text-[12px] text-rose-500">{redeemError}</p>
                  </div>
                )}

                <div className="mt-6 space-y-2">
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={() => void handleRedeem()}
                      disabled={redeeming}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--brand)] to-amber-500 py-3.5 text-[14px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(255,90,60,0.65)] hover:scale-[1.01] disabled:opacity-60"
                    >
                      <Sparkles size={14} />
                      {redeeming ? 'Resgatando…' : 'Resgatar agora'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleLoginToRedeem}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--brand)] to-amber-500 py-3.5 text-[14px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(255,90,60,0.65)] hover:scale-[1.01]"
                      >
                        Entrar e resgatar
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={handleRegisterToRedeem}
                        className="w-full rounded-2xl border border-[var(--line)] py-3 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        Criar conta e resgatar
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Sucesso — convite consumido */}
            {redeemed && (
              <>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                  <Sparkles size={12} />
                  Você agora é PRO
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-[var(--text)]">
                  Bem-vindo ao <strong>PRO</strong>! Todos os limites foram liberados.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="mt-6 w-full rounded-2xl bg-[var(--brand)] py-3.5 text-[14px] font-bold text-white hover:bg-[var(--brand-strong)]"
                >
                  Ir pro app
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
