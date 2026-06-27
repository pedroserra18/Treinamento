import type { Competition, CompetitionEntryKind } from '../../types/competition'

// "Enviar para desafio" CTA shown on the workout summary when the user
// has an active competition. If the user is in a BOTH-type room, they
// pick which counter to log (training vs cardio). Photo is required —
// the button is disabled with a hint otherwise.
export function SendToCompetitionCta({
  competition, hasPhoto, savedSessionId, didTraining, didCardio, status, error, onSend,
}: {
  competition: Competition
  hasPhoto: boolean
  savedSessionId: string | null
  didTraining: boolean
  didCardio: boolean
  status: 'idle' | 'sending' | 'sent' | 'error'
  error: string | null
  onSend: (kinds: CompetitionEntryKind[]) => void
}) {
  const isLobby = competition.status === 'LOBBY'
  // Which kinds the user is allowed to post — must have done that kind in
  // the workout AND the comp must accept it. Drives the buttons below.
  const canTraining =
    didTraining && (competition.type === 'TRAINING' || competition.type === 'BOTH')
  const canCardio =
    didCardio && (competition.type === 'CARDIO' || competition.type === 'BOTH')
  const canBoth = canTraining && canCardio && competition.type === 'BOTH'

  // Nothing matches → skip the whole card entirely. The user will still
  // see the regular "Treino salvo" line but no challenge prompt.
  if (!canTraining && !canCardio) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-[var(--surface-hover)] p-3">
        <p className="text-[11.5px] text-[var(--muted)]">
          <b className="font-semibold text-[var(--text)]">{competition.name ?? 'Seu desafio'}</b>{' '}
          — {competition.type === 'TRAINING'
            ? 'esse desafio é só de treino. Faça pelo menos uma série pra contar.'
            : competition.type === 'CARDIO'
              ? 'esse desafio é só de cardio. Adicione uma atividade de cardio pra contar.'
              : 'faça pelo menos uma série ou um cardio pra contar.'}
        </p>
      </div>
    )
  }

  const disabledBase = isLobby || !hasPhoto || !savedSessionId || status === 'sending' || status === 'sent'

  return (
    <div className="rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-50 to-[var(--surface)] p-4 sm:p-5 dark:from-amber-500/5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 text-base font-extrabold text-amber-900">
          🏆
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {isLobby ? 'Desafio aguardando início' : 'Desafio em andamento'}
          </p>
          <p className="text-sm font-semibold text-[var(--text)]">{competition.name ?? 'Seu desafio'}</p>

          {isLobby && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              O admin precisa iniciar a sala antes que treinos comecem a contar.
              Vá em <b className="text-[var(--text)]">/desafios</b> e clique em "Iniciar agora".
            </p>
          )}
          {!isLobby && !hasPhoto && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Adicione uma foto na seção acima pra registrar a prova do dia.
            </p>
          )}
          {canBoth && hasPhoto && !isLobby && status === 'idle' && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Você fez treino e cardio na mesma sessão — pode contar os 2 dias com uma foto só (2 pontos).
            </p>
          )}
          {status === 'sent' && (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ Prova enviada! Cai no feed da sala.
            </p>
          )}
          {status === 'error' && error && (
            <p className="mt-1 text-[11px] text-red-500">{error}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Primary button: the most-rewarding option for the state.
            - BOTH comp + did both: "Contar treino + cardio" (2 points)
            - else: single button for what was done */}
        {canBoth ? (
          <>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['TRAINING', 'CARDIO'])}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'sending' ? 'Enviando…' : status === 'sent' ? 'Enviado' : 'Contar treino + cardio (2 pts)'}
            </button>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['TRAINING'])}
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Só treino
            </button>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['CARDIO'])}
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Só cardio
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={disabledBase}
            onClick={() => onSend([canTraining ? 'TRAINING' : 'CARDIO'])}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'sending'
              ? 'Enviando…'
              : status === 'sent'
                ? 'Enviado'
                : canTraining
                  ? competition.type === 'BOTH' ? 'Contar como treino' : 'Enviar para o desafio'
                  : competition.type === 'BOTH' ? 'Contar como cardio' : 'Enviar para o desafio'}
          </button>
        )}
      </div>
    </div>
  )
}
