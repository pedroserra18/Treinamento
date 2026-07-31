import { type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { WorkoutShareEditor } from '../../components/common/WorkoutShareEditor'
import { optimizeImageFileToDataUrl } from '../../lib/image/image-processing'
import { sha256OfDataUrl } from '../../lib/image/photo-hash'
import { uploadCompetitionPhoto, postCompetitionEntry } from '../../services/competitionService'
import { clearActiveWorkout } from '../../lib/workout/active-workout-storage'
import type { Competition } from '../../types/competition'
import type { CardioEntryInput } from '../../types/workout'
import type { SessionHighlights } from '../../services/workoutService'
import { parseDurationMin } from './helpers'
import { PlanUpdateDialog } from './TrainDialogs'
import { DurationPickerSheet } from './DurationPickerSheet'
import { SummaryMetricsCards } from './SummaryMetricsCards'
import { SummaryPhotoPicker } from './SummaryPhotoPicker'
import { SendToCompetitionCta } from './SendToCompetitionCta'
import { SummaryShareActions } from './SummaryShareActions'

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

type PlanUpdateDialogState = {
  planName: string
  addedCount: number
  removedCount: number
  reordered: boolean
  applying: boolean
}

// Tela SUMMARY da TrainPage: resumo pós-treino (nome/duração/métricas/foto),
// salvar/descartar, e no pós-save o fluxo social (competição + postar/compartilhar)
// + dialogs (descartar, duration picker, "rotina mudou"). Extraida verbatim; os
// clusters grandes (SummaryMetricsCards / SummaryShareActions) têm os tipos
// derivados de ComponentProps. Estado/handlers ficam na TrainPage (props).
type TrainSummaryScreenProps =
  & Pick<ComponentProps<typeof SummaryMetricsCards>,
      | 'prByExerciseId' | 'prSnapshotAtStart' | 'activeExercises' | 'originMode'
      | 'activePlanId' | 'lastUseByPlanId' | 'elapsedSec' | 'summaryDurationMin' | 'totals'>
  & Pick<ComponentProps<typeof SummaryShareActions>,
      | 'postDone' | 'posting' | 'loadingShare' | 'postPrivacy' | 'postCaption'
      | 'allowedPrivacies' | 'isProfilePrivate' | 'summaryImageFile'
      | 'setPostPrivacy' | 'setPostCaption' | 'setPosting' | 'setPostDone'
      | 'setLoadingShare' | 'setSharePhoto' | 'setShareHighlights' | 'setError' | 'resetWorkflow'>
  & {
      // savedSessionId é string|null na TrainPage (null pré-save); os
      // subcomponentes que exigem string só renderizam no branch já narrowed.
      savedSessionId: string | null
      authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      startedAt: Date | null
      endedAt: Date | null
      error: string | null
      summaryName: string
      setSummaryName: (value: string) => void
      setSummaryDurationMin: (value: string) => void
      durationPickerOpen: boolean
      setDurationPickerOpen: Dispatch<SetStateAction<boolean>>
      saving: boolean
      planUpdateDialog: PlanUpdateDialogState | null
      summaryImagePreview: string | null
      handleSummaryImage: (file: File | null) => void
      confirmDialog: ConfirmDialogState | null
      setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
      activeCompetition: Competition | null
      cardioEntries: CardioEntryInput[]
      competitionSendStatus: 'idle' | 'sending' | 'sent' | 'error'
      setCompetitionSendStatus: Dispatch<SetStateAction<'idle' | 'sending' | 'sent' | 'error'>>
      competitionSendError: string | null
      setCompetitionSendError: Dispatch<SetStateAction<string | null>>
      shareHighlights: SessionHighlights | null
      sharePhoto: string | null
      backToActiveTraining: () => void
      handleSaveClick: () => void
      handlePlanUpdateApply: () => void
      handlePlanUpdateKeep: () => void
    }

export function TrainSummaryScreen({
  prByExerciseId, prSnapshotAtStart, activeExercises, originMode, activePlanId,
  lastUseByPlanId, elapsedSec, summaryDurationMin, totals,
  postDone, posting, loadingShare, postPrivacy, postCaption, allowedPrivacies,
  isProfilePrivate, summaryImageFile, savedSessionId, setPostPrivacy, setPostCaption,
  setPosting, setPostDone, setLoadingShare, setSharePhoto, setShareHighlights, setError, resetWorkflow,
  authorizedFetch, startedAt, endedAt, error, summaryName, setSummaryName, setSummaryDurationMin,
  durationPickerOpen, setDurationPickerOpen, saving, planUpdateDialog, summaryImagePreview,
  handleSummaryImage, confirmDialog, setConfirmDialog, activeCompetition, cardioEntries,
  competitionSendStatus, setCompetitionSendStatus, competitionSendError, setCompetitionSendError,
  shareHighlights, sharePhoto, backToActiveTraining, handleSaveClick, handlePlanUpdateApply, handlePlanUpdateKeep,
}: TrainSummaryScreenProps) {
  // Helpers que precisam estar acessíveis em todo o screen.
  const startedTime = startedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(startedAt)
    : null
  const endedTime = endedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(endedAt)
    : null
  return (
    <section className="space-y-3">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Resumo do treino</h1>
          {/* Botão de voltar pro treino ativo só faz sentido ANTES de
              salvar. Depois do save, a sessão é imutável — esconder o
              botão evita que o user toque por engano e ache que voltou
              pra editar (séries adicionadas pós-save seriam perdidas). */}
          {savedSessionId ? null : (
            <button
              type="button"
              onClick={backToActiveTraining}
              aria-label="Voltar"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={16} />
            </button>
          )}
        </div>
      </motion.header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <article className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        {/* Nome do treino — horários viram subtítulo discreto abaixo
            do input, eliminando a linha de chips que ocupava espaço
            próprio. Mantém a info visível sem demandar atenção. */}
        <div>
          <label className="block text-sm font-semibold text-[var(--text)]" htmlFor="summary-name-input">
            Nome do treino
          </label>
          <input
            id="summary-name-input"
            value={summaryName}
            onChange={(event) => setSummaryName(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          {(startedTime || endedTime) && (
            <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
              {startedTime && endedTime
                ? `${startedTime} → ${endedTime}`
                : startedTime
                  ? `Início ${startedTime}`
                  : `Fim ${endedTime}`}
            </p>
          )}
        </div>

        {/* Duração — abre o wheel picker (estilo iOS) em vez do input
            livre. Mais previsível, sem chance de erro de digitação. */}
        {(() => {
          const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
          const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
          const display = currentMin === 0
            ? '0min'
            : currentMin < 60
              ? `${currentMin}min`
              : `${Math.floor(currentMin / 60)}h ${currentMin % 60}min`
          return (
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Duração</p>
              <button
                type="button"
                onClick={() => setDurationPickerOpen(true)}
                style={{ touchAction: 'manipulation' }}
                className="mt-1 flex w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className="tabular-nums">{display}</span>
                <span className="text-[11px] font-normal text-[var(--muted)]">Tocar pra alterar</span>
              </button>
            </div>
          )
        })()}

        {/* Cards de métricas — Volume + Séries sempre; PRs/Sets
            concluídos/vs último treino só se houver informação útil.
            Cards reduzidos (text-2xl + p-3.5) pra economizar tela. */}
        <SummaryMetricsCards
          prByExerciseId={prByExerciseId}
          prSnapshotAtStart={prSnapshotAtStart}
          activeExercises={activeExercises}
          originMode={originMode}
          activePlanId={activePlanId}
          lastUseByPlanId={lastUseByPlanId}
          elapsedSec={elapsedSec}
          summaryDurationMin={summaryDurationMin}
          totals={totals}
        />

        <SummaryPhotoPicker
          summaryImagePreview={summaryImagePreview}
          onSelectImage={handleSummaryImage}
        />

        {!savedSessionId ? (
          // Pré-save: CTA primário grande + Descartar pequeno e fora
          // do alcance natural do polegar. Hierarquia explícita pra
          // o usuário não confundir "salvar" com "descartar".
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saving || planUpdateDialog?.applying}
              aria-busy={saving || planUpdateDialog?.applying}
              style={{ touchAction: 'manipulation' }}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-[15px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Salvar Treino'}
            </button>
            <button
              type="button"
              onClick={() => {
                const min = Math.max(1, Math.round(elapsedSec / 60))
                setConfirmDialog({
                  title: 'Descartar treino?',
                  message: `Você vai perder ${min} minuto(s) de tracking + as séries marcadas até agora. Esta ação não pode ser desfeita.`,
                  confirmLabel: 'Descartar',
                  destructive: true,
                  onConfirm: () => {
                    clearActiveWorkout()
                    resetWorkflow()
                  },
                })
              }}
              className="block w-full rounded-xl border border-[var(--line)] py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:border-rose-500/40 hover:text-rose-400"
            >
              Descartar treino
            </button>
          </div>
        ) : (
          // Pós-save: hierarquia em 3 níveis pra eliminar a confusão.
          // Nível 1: Confirmação grande "Treino salvo!" com troféu
          // Nível 2: Competição (apenas se houver, banner laranja)
          // Nível 3: Compartilhar imagem + Postar — em cards visuais
          //          paralelos, e "Concluir" sempre acessível.
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-[var(--surface)] p-4">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-emerald-500">
                  <Check size={18} strokeWidth={3} />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-emerald-500">Treino salvo!</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} kg de volume · {totals.totalSeries} séries
                  </p>
                </div>
              </div>
            </div>

            {/* Nível 2: Competição (banner laranja) — só se houver
                competição ativa e treino válido. */}
            {activeCompetition && (() => {
              const didTraining = activeExercises.some((ex) => ex.sets.some((s) => s.checked))
              const didCardio = cardioEntries.length > 0
              return (
                <SendToCompetitionCta
                  competition={activeCompetition}
                  hasPhoto={!!summaryImageFile}
                  savedSessionId={savedSessionId}
                  didTraining={didTraining}
                  didCardio={didCardio}
                  status={competitionSendStatus}
                  error={competitionSendError}
                  onSend={async (kinds) => {
                    if (!summaryImageFile || !savedSessionId) return
                    setCompetitionSendStatus('sending')
                    setCompetitionSendError(null)
                    try {
                      const dataUrl = await optimizeImageFileToDataUrl(summaryImageFile, {
                        maxEdge: 1200,
                        quality: 0.84,
                        maxOutputBytes: 1_400_000,
                      })
                      const hash = await sha256OfDataUrl(dataUrl)
                      const { photoUrl, photoPath } = await uploadCompetitionPhoto(authorizedFetch, dataUrl)
                      for (const kind of kinds) {
                        await postCompetitionEntry(authorizedFetch, activeCompetition.id, {
                          kind,
                          photoUrl,
                          photoPath,
                          photoHash: hash,
                          workoutSessionId: savedSessionId,
                        })
                      }
                      setCompetitionSendStatus('sent')
                    } catch (err) {
                      setCompetitionSendStatus('error')
                      setCompetitionSendError(err instanceof Error ? err.message : 'Falha ao enviar')
                    }
                  }}
                />
              )
            })()}

            {/* Nível 3: ações sociais — Postar + Compartilhar lado a
                lado em mobile (stack) e duas colunas no desktop. */}
            <SummaryShareActions
              postDone={postDone}
              posting={posting}
              loadingShare={loadingShare}
              postPrivacy={postPrivacy}
              postCaption={postCaption}
              allowedPrivacies={allowedPrivacies}
              isProfilePrivate={isProfilePrivate}
              summaryImageFile={summaryImageFile}
              savedSessionId={savedSessionId}
              setPostPrivacy={setPostPrivacy}
              setPostCaption={setPostCaption}
              setPosting={setPosting}
              setPostDone={setPostDone}
              setLoadingShare={setLoadingShare}
              setSharePhoto={setSharePhoto}
              setShareHighlights={setShareHighlights}
              setError={setError}
              resetWorkflow={resetWorkflow}
            />
          </div>
        )}
      </article>

      {shareHighlights && (
        <WorkoutShareEditor
          highlights={shareHighlights}
          initialPhoto={sharePhoto}
          onClose={() => setShareHighlights(null)}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={() => {
            const handler = confirmDialog.onConfirm
            setConfirmDialog(null)
            handler()
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {durationPickerOpen && (() => {
        const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
        const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
        return (
          <DurationPickerSheet
            open
            currentMin={currentMin}
            onConfirm={(min) => setSummaryDurationMin(String(min))}
            onClose={() => setDurationPickerOpen(false)}
          />
        )
      })()}

      {/* Dialog — Rotina mudou. Aparece quando o user fez
          add/remove/reorder durante a sessão de uma rotina. Pergunta
          se quer propagar as mudanças pras próximas sessões dessa
          rotina (atualizar plan) ou manter a rotina original como
          estava (próximo treino começa com os exercícios antigos). */}
      {planUpdateDialog ? (
        <PlanUpdateDialog
          state={planUpdateDialog}
          onApply={() => void handlePlanUpdateApply()}
          onKeep={handlePlanUpdateKeep}
        />
      ) : null}
    </section>
  )
}
