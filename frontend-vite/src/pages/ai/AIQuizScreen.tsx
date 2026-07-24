import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { type Dispatch, type RefObject, type SetStateAction } from 'react'
import { updateBirthDate, type ProfileDefaults } from '../../services/authService'
import {
  ageBucketFromBirthDate, getVisibleSteps,
  GOAL_RECOMMENDED_RANGE, MUSCLES_LIST, REP_HINTS,
  type AppScreen, type QuizAnswers,
} from './ai-workout-utils'
import { OptionCard, ProgressBar } from './ai-components'

// Tela QUIZ do gerador de treino IA: wizard de 20 passos (frequencia, nivel,
// perfil, objetivo, local, divisao, tecnicas, foco muscular, restricoes, etc.)
// + a shell (ProgressBar + navegacao Voltar/Proximo). Verbatim; estado, handlers
// e refs sao passados com os mesmos nomes por props (estado fica na pagina).
export function AIQuizScreen({
  answers, step, direction, isEditMode, extraHistory, authorizedFetch, profileDefaultsRef,
  setAnswers, setAppScreen, setDirection,
  selectAndAdvance, selectGender, toggleTechnique, toggleMuscle, goBack, advanceStep,
}: {
  answers: QuizAnswers
  step: number
  direction: number
  isEditMode: boolean
  extraHistory: string[]
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  profileDefaultsRef: RefObject<ProfileDefaults | null>
  setAnswers: Dispatch<SetStateAction<QuizAnswers>>
  setAppScreen: Dispatch<SetStateAction<AppScreen>>
  setDirection: Dispatch<SetStateAction<number>>
  selectAndAdvance: (key: keyof QuizAnswers, value: string) => void
  selectGender: (value: 'Masculino' | 'Feminino') => void
  toggleTechnique: (t: string) => void
  toggleMuscle: (m: string) => void
  goBack: () => void
  advanceStep: () => void
}) {
  const recommendedRange = GOAL_RECOMMENDED_RANGE[answers.goal] ?? null

  const visibleSteps = getVisibleSteps(answers)
  const totalVisible = visibleSteps.length
  const visibleIdx = visibleSteps.indexOf(step)
  const isLastVisibleStep = visibleIdx === totalVisible - 1

  // Steps that need explicit Next button (multi-select or text input)
  const needsNextButton = [2, 12, 13, 14, 15].includes(step)
    || (step === 18 && answers.hasExtraInfo === true)
    || (step === 19 && answers.splitPreference === 'Outro')

  const stepContent = (() => {
    switch (step) {
      case 0:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Quantos dias por semana você vai treinar?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Escolha sua frequência semanal</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[['2', '2x por semana', 'Ideal para começar'], ['3', '3x por semana', 'Bom equilíbrio'], ['4', '4x por semana', 'Frequência eficiente'], ['5', '5x por semana', 'Volume alto'], ['6', '6x por semana', 'Atletas avançados']].map(([val, label, hint]) => (
                <OptionCard key={val} label={label} hint={hint} selected={answers.daysPerWeek === val} onClick={() => selectAndAdvance('daysPerWeek', val)} />
              ))}
            </div>
          </>
        )

      case 1:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual é o seu nível de experiência?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Isso ajuda a calibrar volume e intensidade</p>
            <div className="mt-5 space-y-2">
              {[['Iniciante', 'Menos de 1 ano treinando'], ['Intermediário', '1 a 3 anos treinando'], ['Avançado', 'Mais de 3 anos treinando']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.experience === val} onClick={() => selectAndAdvance('experience', val)} />
              ))}
            </div>
          </>
        )

      case 2:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual a sua data de nascimento?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Calculamos a idade automaticamente — você não precisa responder de novo nas próximas vezes</p>
            <div className="mt-5">
              <input
                type="date"
                value={answers.birthDate}
                max={new Date().toISOString().slice(0, 10)}
                min="1920-01-01"
                onChange={(e) => {
                  const bd = e.target.value
                  setAnswers(prev => ({ ...prev, birthDate: bd, age: bd ? ageBucketFromBirthDate(bd) : '' }))
                  if (bd) {
                    // Persiste no perfil pra não perguntar de novo, e atualiza
                    // o ref pra que "começar do zero" na mesma sessão não
                    // reperguntar (o ref foi populado na montagem, antes disto).
                    profileDefaultsRef.current = { ...(profileDefaultsRef.current ?? { weightKg: null, heightCm: null, gender: null, birthDate: null, age: null, experienceLevel: null, primaryGoal: null }), birthDate: bd }
                    void updateBirthDate(authorizedFetch, bd).catch(() => {})
                  }
                }}
                className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
              />
              {answers.birthDate && (
                <p className="mt-2 text-[12px] text-[var(--muted)]">
                  Faixa etária: <span className="font-semibold text-[var(--brand)]">{ageBucketFromBirthDate(answers.birthDate)}</span>
                </p>
              )}
            </div>
          </>
        )

      case 3:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual o seu gênero?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Define a ênfase muscular padrão quando não há foco específico</p>
            <div className="mt-5 space-y-2">
              {[['Masculino', 'Ênfase padrão em superiores (peito/costas/ombros)'], ['Feminino', 'Ênfase padrão em inferiores (glúteo/posterior/quad)']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.gender === val} onClick={() => selectGender(val as 'Masculino' | 'Feminino')} />
              ))}
            </div>
          </>
        )

      case 4:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual fase você está atualmente?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Define a estratégia de volume e intensidade</p>
            <div className="mt-5 space-y-2">
              {[['Ganho de massa', 'Foco em aumentar volume muscular com superávit calórico'], ['Cutting (definição)', 'Manter músculo enquanto perde gordura'], ['Recomposição', 'Ganhar músculo e perder gordura simultaneamente'], ['Manutenção', 'Manter o físico atual com boa qualidade de vida']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.phase === val} onClick={() => selectAndAdvance('phase', val)} />
              ))}
            </div>
          </>
        )

      case 5:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual o foco principal do treino?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">O objetivo que guia a seleção de exercícios e métodos</p>
            <div className="mt-5 space-y-2">
              {[['Hipertrofia', 'Maximizar crescimento muscular'], ['Força', 'Aumentar cargas e força máxima'], ['Emagrecimento', 'Queima de gordura com treinos mais intensos'], ['Resistência', 'Melhorar capacidade cardiovascular e muscular'], ['Recuperação de lesão', 'Treino adaptado para reabilitação']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.goal === val} onClick={() => selectAndAdvance('goal', val)} />
              ))}
            </div>
          </>
        )

      case 6:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Onde você treina?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Define os exercícios e equipamentos disponíveis</p>
            <div className="mt-5 space-y-2">
              {[['Academia completa', 'Acesso a todos os aparelhos e pesos livres'], ['Em casa com equipamentos', 'Halteres, barras, elásticos ou banco'], ['Em casa sem equipamentos', 'Apenas peso corporal']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.location === val} onClick={() => selectAndAdvance('location', val)} />
              ))}
            </div>
          </>
        )

      case 7:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Preferência de equipamentos?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Mesmo em academia, você pode ter uma preferência</p>
            <div className="mt-5 space-y-2">
              {[['Pesos livres', 'Halteres e barras — mais ativação muscular'], ['Máquinas', 'Maior segurança e isolamento'], ['Misto', 'Combinação de pesos livres e máquinas']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.equipment === val} onClick={() => selectAndAdvance('equipment', val)} />
              ))}
            </div>
          </>
        )

      case 8:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Duração desejada da sessão?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">O tempo que você tem disponível por treino</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[['30', '30 minutos'], ['45', '45 minutos'], ['60', '1 hora'], ['90', '1h30'], ['120', '2 horas']].map(([val, label]) => (
                <OptionCard key={val} label={label} selected={answers.duration === val} onClick={() => selectAndAdvance('duration', val)} />
              ))}
            </div>
          </>
        )

      case 9:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Frequência por grupo muscular?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Quantas vezes por semana cada músculo será treinado</p>
            <div className="mt-5 space-y-2">
              {[['1x por semana', 'Cada músculo aparece uma vez (ex: Bro Split)'], ['2x por semana', 'Cada músculo aparece duas vezes (ex: Upper/Lower)'], ['IA decide', 'A IA escolhe o melhor split para seu perfil']].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.muscleFrequency === val} onClick={() => selectAndAdvance('muscleFrequency', val)} />
              ))}
            </div>
          </>
        )

      case 10:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Faixa de repetições preferida?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Será usada como referência principal nos exercícios</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {(['4–6', '5–9', '6–8', '8–10', '10–12', '12–15'] as const).map(val => (
                <OptionCard
                  key={val}
                  label={val + ' reps'}
                  hint={REP_HINTS[val]}
                  recommended={val === recommendedRange}
                  selected={answers.repRange === val}
                  onClick={() => selectAndAdvance('repRange', val)}
                />
              ))}
            </div>
            {recommendedRange && (
              <p className="mt-3 text-[11px] text-[var(--muted)]">
                ★ Faixa recomendada para <span className="font-semibold text-[var(--brand)]">{answers.goal}</span>: {recommendedRange} reps
              </p>
            )}
          </>
        )

      case 11:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Tempo de descanso entre séries?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Influencia diretamente a intensidade e o volume da sessão</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {([
                ['30s', '30 segundos', 'Resistência e condicionamento'],
                ['45s', '45 segundos', 'Alta intensidade metabólica'],
                ['1min', '1 minuto', 'Hipertrofia com densidade'],
                ['1min30s', '1 min 30 seg', 'Hipertrofia clássica'],
                ['2min', '2 minutos', 'Hipertrofia e força'],
                ['2min30s', '2 min 30 seg', 'Força com volume'],
                ['3min', '3 minutos', 'Força máxima e compostos pesados'],
                ['IA decide', 'IA decide', 'Adaptado ao tipo de exercício'],
              ] as const).map(([val, label, hint]) => (
                <OptionCard key={val} label={label} hint={hint} selected={answers.restTime === val} onClick={() => selectAndAdvance('restTime', val)} />
              ))}
            </div>
          </>
        )

      case 12:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Técnicas avançadas?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Selecione uma ou mais (pode escolher várias)</p>
            <div className="mt-5 space-y-2">
              {['Nenhuma', 'Drop Set', 'Cluster Set', 'Rest-Pause', 'Bi-Set'].map(t => {
                const selected = answers.techniques.includes(t)
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTechnique(t)}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                      selected
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))]'
                        : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    <span className={`text-sm font-bold ${selected ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{t}</span>
                    {selected && <CheckCircle2 size={16} className="shrink-0 text-[var(--brand)]" />}
                  </button>
                )
              })}
            </div>
          </>
        )

      case 13:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Tem foco muscular específico?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Selecione até 3 músculos que quer priorizar</p>
            <div className="mt-4 flex gap-2">
              {[true, false].map(val => (
                <button
                  type="button"
                  key={String(val)}
                  onClick={() => setAnswers(prev => ({ ...prev, hasFocus: val, musclesFocus: val ? prev.musclesFocus : [] }))}
                  className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                    answers.hasFocus === val
                      ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                      : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                  }`}
                >
                  {val ? 'Sim' : 'Não'}
                </button>
              ))}
            </div>
            {answers.hasFocus === true && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                  Selecione até 3 músculos ({answers.musclesFocus.length}/3)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {MUSCLES_LIST.map(m => {
                    const selected = answers.musclesFocus.includes(m)
                    const disabled = !selected && answers.musclesFocus.length >= 3
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => !disabled && toggleMuscle(m)}
                        disabled={disabled}
                        className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${
                          selected
                            ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                            : disabled
                              ? 'border-[var(--line)] text-[var(--muted)] opacity-40'
                              : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                        }`}
                      >
                        {m}
                        {selected && <CheckCircle2 size={14} className="shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </>
        )

      case 14:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Lesões ou exercícios para evitar?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Opcional — pode pular se não tiver nenhuma restrição</p>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--text)]">Tenho uma lesão</p>
                  <button
                    type="button"
                    onClick={() => setAnswers(prev => ({ ...prev, hasInjury: !prev.hasInjury, injuryDescription: prev.hasInjury ? '' : prev.injuryDescription }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.hasInjury ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.hasInjury ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {answers.hasInjury && (
                  <motion.textarea
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    value={answers.injuryDescription}
                    onChange={e => setAnswers(prev => ({ ...prev, injuryDescription: e.target.value }))}
                    placeholder="Descreva sua lesão... Ex: dor no joelho direito, hérnia lombar L4-L5"
                    rows={3}
                    className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                  />
                )}
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--text)]">Quero evitar exercícios</p>
                  <button
                    type="button"
                    onClick={() => setAnswers(prev => ({ ...prev, avoidExercises: prev.avoidExercises ? '' : ' ' }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.avoidExercises.trim() !== '' ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.avoidExercises.trim() !== '' ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {answers.avoidExercises.trim() !== '' || answers.avoidExercises === ' ' ? (
                  <motion.textarea
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    value={answers.avoidExercises.trimStart()}
                    onChange={e => setAnswers(prev => ({ ...prev, avoidExercises: e.target.value }))}
                    placeholder="Ex: agachamento livre, supino reto, levantamento terra"
                    rows={3}
                    className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                  />
                ) : null}
              </div>
            </div>
          </>
        )

      case 15:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Altura e peso? (opcional)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Ajuda a calibrar carga inicial e cuidados articulares</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--muted)]">Altura (cm)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={250}
                  value={answers.heightCm}
                  onChange={e => setAnswers(prev => ({ ...prev, heightCm: e.target.value.replace(/[^\d]/g, '') }))}
                  placeholder="Ex: 175"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--muted)]">Peso (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={30}
                  max={300}
                  step="0.1"
                  value={answers.weightKg}
                  onChange={e => setAnswers(prev => ({ ...prev, weightKg: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') }))}
                  placeholder="Ex: 75"
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                />
              </label>
            </div>
          </>
        )

      case 16:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Quantos exercícios por treino?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Influencia o tamanho da sessão (cobertura obrigatória é mantida)</p>
            <div className="mt-5 space-y-2">
              {[
                ['Curto', '4-5 exercícios — sessões rápidas e densas'],
                ['Médio', '6-7 exercícios — equilíbrio padrão'],
                ['Longo', '8-10 exercícios — volume alto'],
                ['IA decide', 'A IA escolhe pelo perfil e duração'],
              ].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.exerciseCount === val} onClick={() => selectAndAdvance('exerciseCount', val)} />
              ))}
            </div>
          </>
        )

      case 17:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Proximidade da falha (RIR)?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Quantas repetições deixar na reserva</p>
            <div className="mt-5 space-y-2">
              {[
                ['Falha', 'Treino até a falha em isolados; RIR 1 em compostos'],
                ['RIR 1-2', 'Deixo 1-2 reps na reserva (padrão hipertrofia)'],
                ['RIR 3+', 'Deixo 3+ reps na reserva (foco em técnica/recuperação)'],
                ['IA decide', 'A IA escolhe pelo nível e exercício'],
              ].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.rirTarget === val} onClick={() => selectAndAdvance('rirTarget', val)} />
              ))}
            </div>
          </>
        )

      case 18:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Quer adicionar algo para a IA?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Exercício específico, observação ou qualquer detalhe extra</p>
            <div className="mt-4 flex gap-2">
              {[true, false].map(val => (
                <button
                  type="button"
                  key={String(val)}
                  onClick={() => {
                    if (!val) {
                      setAnswers(prev => ({ ...prev, hasExtraInfo: false, extraInfo: '' }))
                      setDirection(1)
                      setAppScreen('REVIEW')
                    } else {
                      setAnswers(prev => ({ ...prev, hasExtraInfo: true }))
                    }
                  }}
                  className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                    answers.hasExtraInfo === val
                      ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                      : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                  }`}
                >
                  {val ? 'Sim' : 'Não'}
                </button>
              ))}
            </div>
            {answers.hasExtraInfo === true && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Escreve o que queres incluir ou evitar</p>
                <textarea
                  value={answers.extraInfo}
                  onChange={e => setAnswers(prev => ({ ...prev, extraInfo: e.target.value }))}
                  placeholder="Ex: quero incluir agachamento búlgaro, prefiro supino inclinado em vez do reto, adicionar exercício para antebraço..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                />
                {extraHistory.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Pedidos recentes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {extraHistory.map((h, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setAnswers(prev => ({ ...prev, extraInfo: h }))}
                          className="max-w-[260px] truncate rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--brand)]/50"
                          title={h}
                        >
                          {h.length > 40 ? h.slice(0, 40) + '…' : h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )

      case 19:
        return (
          <>
            <h2 className="text-xl font-black text-[var(--text)]">Qual divisão de treino você prefere?</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Escolha a estrutura, escreva a sua, ou deixe a IA decidir</p>
            <div className="mt-5 space-y-2">
              {[
                ['IA decide', 'A IA escolhe a melhor divisão pelo seu perfil (dias, foco, frequência)'],
                ['Full Body', 'Todos os grupos em cada treino — ótimo para força e frequência alta'],
                ['Upper/Lower', 'Alterna superior e inferior'],
                ['Push/Pull/Legs', 'Empurrar / Puxar / Pernas'],
                ['Torso/Limbs', 'Tronco (peito/costas/ombros) / Membros (braços + pernas)'],
                ['Especializado inferior', 'Mais dias de perna com focos diferentes (quad / glúteo / posterior)'],
                ['Bro Split', 'Um grupo muscular dedicado por dia'],
              ].map(([val, hint]) => (
                <OptionCard key={val} label={val} hint={hint} selected={answers.splitPreference === val} onClick={() => selectAndAdvance('splitPreference', val)} />
              ))}
              {/* "Outro" não auto-avança — abre textarea pra escrever a divisão. */}
              <OptionCard
                label="Outro (escrever a minha)"
                hint="Descreva sua própria divisão — a IA vai entender e gerar"
                selected={answers.splitPreference === 'Outro'}
                onClick={() => setAnswers(prev => ({ ...prev, splitPreference: 'Outro' }))}
              />
            </div>
            {answers.splitPreference === 'Outro' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                  Escreve a divisão — UM DIA POR LINHA (ou separados por "/")
                </p>
                <textarea
                  value={answers.customSplit}
                  onChange={e => setAnswers(prev => ({ ...prev, customSplit: e.target.value }))}
                  placeholder={'Ex:\nPeito e tríceps\nCostas e bíceps\nPernas (foco glúteo)\nOmbros e abdômen'}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                />
                <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                  Cada linha vira um treino. A IA cobre os músculos que você escrever em cada dia.
                </p>
              </motion.div>
            )}
          </>
        )

      default:
        return null
    }
  })()

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        {isEditMode ? (
          <p className="mb-6 text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
            Editando resposta
          </p>
        ) : (
          <ProgressBar step={Math.max(visibleIdx, 0) + 1} total={totalVisible} />
        )}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 50, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -50, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {stepContent}
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            <ChevronLeft size={15} />
            {isEditMode ? 'Resumo' : step === 0 ? 'Início' : 'Voltar'}
          </button>
          {isEditMode ? (
            needsNextButton && (
              <button
                type="button"
                onClick={() => setAppScreen('REVIEW')}
                disabled={step === 13 && answers.hasFocus === null}
                className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Salvar
              </button>
            )
          ) : (
            <>
              {needsNextButton && (
                <button
                  type="button"
                  onClick={advanceStep}
                  disabled={step === 13 && answers.hasFocus === null}
                  className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {isLastVisibleStep ? 'Ver resumo' : 'Próximo'}
                </button>
              )}
              {(step === 14 || step === 15) && (
                <button
                  type="button"
                  onClick={advanceStep}
                  className="text-xs text-[var(--muted)] underline underline-offset-2"
                >
                  Pular
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
