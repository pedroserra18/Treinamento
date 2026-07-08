import { useAuth } from '../../hooks/useAuth'
import { createPost, type PostPrivacy } from '../../services/socialService'
import { getSessionHighlights, type SessionHighlights } from '../../services/workoutService'
import { feedFirstPageCache } from '../../lib/cache/feed-cache'
import { optimizeImageFileToDataUrl } from '../../lib/image/image-processing'

type SummaryShareActionsProps = {
  postDone: boolean
  posting: boolean
  loadingShare: boolean
  postPrivacy: PostPrivacy
  postCaption: string
  allowedPrivacies: PostPrivacy[]
  isProfilePrivate: boolean
  summaryImageFile: File | null
  savedSessionId: string
  setPostPrivacy: (privacy: PostPrivacy) => void
  setPostCaption: (value: string) => void
  setPosting: (value: boolean) => void
  setPostDone: (value: boolean) => void
  setLoadingShare: (value: boolean) => void
  setSharePhoto: (value: string | null) => void
  setShareHighlights: (value: SessionHighlights | null) => void
  setError: (value: string | null) => void
  resetWorkflow: () => void
}

// Acoes sociais pos-treino da tela SUMMARY: painel "Postar este treino?"
// (privacidade + legenda + POST real no feed), botao "Compartilhar imagem"
// (monta os highlights p/ o WorkoutShareEditor), "Pular e concluir", e o
// estado "Post publicado!". Estado vive no pai (TrainPage); recebe valores +
// setters como props. authorizedFetch vem do proprio useAuth. Extraido verbatim.
export function SummaryShareActions({
  postDone,
  posting,
  loadingShare,
  postPrivacy,
  postCaption,
  allowedPrivacies,
  isProfilePrivate,
  summaryImageFile,
  savedSessionId,
  setPostPrivacy,
  setPostCaption,
  setPosting,
  setPostDone,
  setLoadingShare,
  setSharePhoto,
  setShareHighlights,
  setError,
  resetWorkflow,
}: SummaryShareActionsProps) {
  const { authorizedFetch } = useAuth()
  return (
    <>
      {!postDone ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[var(--line)] p-4">
            <p className="text-sm font-semibold text-[var(--text)]">Postar este treino?</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              Aparece no seu feed. Você pode controlar quem vê embaixo.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allowedPrivacies.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPostPrivacy(p)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    postPrivacy === p
                      ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                      : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {p === 'PUBLIC' ? 'Público' : p === 'FRIENDS' ? 'Amigos' : 'Privado'}
                </button>
              ))}
            </div>
            {isProfilePrivate ? (
              <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                Sua conta está privada — posts públicos ficam disponíveis apenas como "Amigos" ou "Privado".
              </p>
            ) : null}
            {/* Caption escondida atrás de "+" pra reduzir o
                número de campos visíveis. Quem quer caption
                clica; quem não quer, posta direto. */}
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
                + Adicionar legenda
              </summary>
              <textarea
                value={postCaption}
                onChange={(e) => setPostCaption(e.target.value)}
                placeholder="O que você quer compartilhar?"
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              />
            </details>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={posting}
                onClick={async () => {
                  try {
                    setPosting(true)
                    let photoDataUrl: string | undefined
                    if (summaryImageFile) {
                      photoDataUrl = await optimizeImageFileToDataUrl(summaryImageFile, {
                        maxEdge: 1200,
                        quality: 0.82,
                        maxOutputBytes: 1_500_000,
                      })
                    }
                    await createPost(authorizedFetch, {
                      workoutSessionId: savedSessionId,
                      caption: postCaption.trim() || undefined,
                      photoUrl: photoDataUrl,
                      privacy: postPrivacy,
                    })
                    // Invalida o cache do feed pra próximo abrir
                    // já mostrar o post recém-criado.
                    feedFirstPageCache.invalidate()
                    // Lembra a última privacy escolhida pra
                    // o próximo treino abrir já marcado nela.
                    try { window.localStorage.setItem('acad:last-post-privacy', postPrivacy) } catch { /* ignora */ }
                    setPostDone(true)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Erro ao postar')
                  } finally {
                    setPosting(false)
                  }
                }}
                style={{ touchAction: 'manipulation' }}
                className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] disabled:opacity-60"
              >
                {posting ? 'Postando…' : 'Postar treino'}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={loadingShare || !savedSessionId}
            onClick={async () => {
              if (!savedSessionId) return
              try {
                setLoadingShare(true)
                setError(null)
                if (summaryImageFile) {
                  try {
                    setSharePhoto(await optimizeImageFileToDataUrl(summaryImageFile, { maxEdge: 1600, quality: 0.88 }))
                  } catch { setSharePhoto(null) }
                } else {
                  setSharePhoto(null)
                }
                const highlights = await getSessionHighlights(authorizedFetch, savedSessionId)
                setShareHighlights(highlights)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Erro ao preparar imagem')
              } finally {
                setLoadingShare(false)
              }
            }}
            style={{ touchAction: 'manipulation' }}
            className="w-full rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 py-2.5 text-sm font-bold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10 disabled:opacity-60"
          >
            {loadingShare ? 'Preparando…' : 'Compartilhar imagem (Instagram, Stories…)'}
          </button>

          <button
            type="button"
            onClick={resetWorkflow}
            className="block w-full rounded-xl py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            Pular e concluir
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
          <p className="text-sm font-semibold text-emerald-500">Post publicado!</p>
          <button
            type="button"
            onClick={resetWorkflow}
            style={{ touchAction: 'manipulation' }}
            className="mt-2 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white"
          >
            Concluir
          </button>
        </div>
      )}
    </>
  )
}
