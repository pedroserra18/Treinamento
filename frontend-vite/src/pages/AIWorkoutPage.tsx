import { AIWelcomeScreen } from './ai/AIWelcomeScreen'
import { AILoadingScreen } from './ai/AILoadingScreen'
import { AIReviewScreen } from './ai/AIReviewScreen'
import { AIResultScreen } from './ai/AIResultScreen'
import { AIQuizScreen } from './ai/AIQuizScreen'
import { useAIWorkout } from './ai/useAIWorkout'

// ─── Container ──────────────────────────────────────────────────────────────
// Estado, efeitos e handlers vivem em ai/useAIWorkout. As telas vivem em ai/
// (Welcome/Loading/Quiz/Review/Result). Aqui fica só o roteamento por appScreen.

export function AIWorkoutPage() {
  const {
    appScreen,
    // WELCOME
    hasSavedAnswers, setStep, setIsEditMode, setAppScreen, resetQuiz,
    recentGenerations, recentSheetOpen, recentGenerationsLoading, recentGenerationsError, setRecentSheetOpen,
    // LOADING
    generatingStep, loadingMsgIdx,
    // QUIZ
    answers, step, direction, isEditMode, extraHistory, authorizedFetch, profileDefaultsRef,
    setAnswers, setDirection, selectAndAdvance, selectGender, toggleTechnique, toggleMuscle, goBack, advanceStep,
    // REVIEW
    error, handleGenerate,
    // RESULT
    sections, resolvedWeekdays, activeDayIndex, regeneratingIndex, saveResults, expandedExerciseKey,
    savingIndex, swappingKey, resultRef, setActiveDayIndex, setExpandedExerciseKey,
    moveExercise, swapExercise, removeExercise, handleSaveOne, handleRegenerateDay, navigate,
  } = useAIWorkout()

  // ─── WELCOME ──────────────────────────────────────────────────────────────

  if (appScreen === 'WELCOME') {
    return (
      <AIWelcomeScreen
        hasSavedAnswers={hasSavedAnswers}
        onContinue={() => { setStep(0); setIsEditMode(false); setAppScreen('REVIEW') }}
        onReset={resetQuiz}
        recentGenerations={recentGenerations}
        recentSheetOpen={recentSheetOpen}
        recentGenerationsLoading={recentGenerationsLoading}
        recentGenerationsError={recentGenerationsError}
        onOpenRecent={() => setRecentSheetOpen(true)}
        onCloseRecent={() => setRecentSheetOpen(false)}
      />
    )
  }

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (appScreen === 'LOADING') {
    return (
      <AILoadingScreen generatingStep={generatingStep} loadingMsgIdx={loadingMsgIdx} />
    )
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────────────

  if (appScreen === 'QUIZ') {
    return (
      <AIQuizScreen
        answers={answers}
        step={step}
        direction={direction}
        isEditMode={isEditMode}
        extraHistory={extraHistory}
        authorizedFetch={authorizedFetch}
        profileDefaultsRef={profileDefaultsRef}
        setAnswers={setAnswers}
        setAppScreen={setAppScreen}
        setDirection={setDirection}
        selectAndAdvance={selectAndAdvance}
        selectGender={selectGender}
        toggleTechnique={toggleTechnique}
        toggleMuscle={toggleMuscle}
        goBack={goBack}
        advanceStep={advanceStep}
      />
    )
  }

  // ─── REVIEW ───────────────────────────────────────────────────────────────

  if (appScreen === 'REVIEW') {
    return (
      <AIReviewScreen
        answers={answers}
        error={error}
        onEditField={(chipStep) => { setIsEditMode(true); setStep(chipStep); setDirection(0); setAppScreen('QUIZ') }}
        onToggleCardio={() => setAnswers((a) => ({ ...a, wantsCardio: !a.wantsCardio }))}
        onGenerate={() => void handleGenerate()}
      />
    )
  }

  // ─── RESULT ───────────────────────────────────────────────────────────────

  return (
    <AIResultScreen
      sections={sections}
      answers={answers}
      resolvedWeekdays={resolvedWeekdays}
      activeDayIndex={activeDayIndex}
      error={error}
      regeneratingIndex={regeneratingIndex}
      saveResults={saveResults}
      expandedExerciseKey={expandedExerciseKey}
      savingIndex={savingIndex}
      swappingKey={swappingKey}
      resultRef={resultRef}
      resetQuiz={resetQuiz}
      handleGenerate={handleGenerate}
      setActiveDayIndex={setActiveDayIndex}
      setExpandedExerciseKey={setExpandedExerciseKey}
      moveExercise={moveExercise}
      swapExercise={swapExercise}
      removeExercise={removeExercise}
      handleSaveOne={handleSaveOne}
      handleRegenerateDay={handleRegenerateDay}
      navigate={navigate}
    />
  )
}
