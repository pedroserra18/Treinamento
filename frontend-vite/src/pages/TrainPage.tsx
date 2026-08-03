import { TrainRecommendationsScreen } from './train/TrainRecommendationsScreen'
import { TrainSendRoutineScreen } from './train/TrainSendRoutineScreen'
import { TrainNewRoutineScreen } from './train/TrainNewRoutineScreen'
import { TrainEditRoutineScreen } from './train/TrainEditRoutineScreen'
import { TrainDashboardScreen } from './train/TrainDashboardScreen'
import { TrainSummaryScreen } from './train/TrainSummaryScreen'
import { TrainActiveScreen } from './train/TrainActiveScreen'
import { useTrainSession } from './train/useTrainSession'

// ─── Container ──────────────────────────────────────────────────────────────
// Estado, efeitos e handlers vivem em train/useTrainSession. As telas vivem em
// train/ (Dashboard/Active/Summary/Recommendations/Routine forms). Aqui fica so
// a chamada do hook + o roteamento por screen.
export function TrainPage() {
  const {
    activeCompetition,
    activeExercises,
    activePlanId,
    activePlanName,
    addDropEntry,
    addExerciseOpen,
    addExerciseToActiveWorkout,
    addSet,
    addSetCopyingPrevious,
    adjustRestTimer,
    advancedTimerOpen,
    allowedPrivacies,
    applyManualTimerEdit,
    applyRestEdit,
    applySubstitution,
    authorizedFetch,
    backToActiveTraining,
    backToDashboardFromActive,
    beginEmptyTraining,
    beginRoutineTraining,
    cardioEntries,
    competitionSendError,
    competitionSendStatus,
    completeSet,
    confirmDialog,
    contextMenuExerciseIndex,
    createExerciseForAdd,
    createExerciseForSubstituteIndex,
    createExerciseOpen,
    displayElapsedSec,
    dndSensors,
    durationPickerOpen,
    durationWarning,
    editingRestExerciseIndex,
    elapsedSec,
    endedAt,
    error,
    finalizeWithSafetyCheck,
    handleCreateAndSendRoutine,
    handleCreateRoutineSubmit,
    handleDeleteRoutine,
    handleDuplicateRoutine,
    handleDurationAdjust,
    handleDurationKeepCurrent,
    handleEditRoutineSubmit,
    handleExerciseDragEnd,
    handleExportPDF,
    handlePlanUpdateApply,
    handlePlanUpdateKeep,
    handleRemoveExercise,
    handleSaveClick,
    handleShareRoutine,
    handleSummaryImage,
    hydrated,
    infoDialog,
    intensityMode,
    isProfilePrivate,
    isWorkoutRunning,
    lastPerformanceByExercise,
    lastUseByPlanId,
    loadingPlans,
    loadingShare,
    manualTimerMinutes,
    mostRecentSession,
    openRoutineMenuId,
    openTypePicker,
    optimisticPlanIds,
    originMode,
    pairAsSuperset,
    patchDropEntry,
    patchSet,
    planUpdateDialog,
    plans,
    postCaption,
    postDone,
    postPrivacy,
    posting,
    prByExerciseId,
    prCelebration,
    prSnapshotAtStart,
    removeDropEntry,
    removeFromSuperset,
    removeSet,
    reorderSheetOpen,
    resetWorkflow,
    restFinishedName,
    routineFilter,
    routineMenuAnchor,
    savedSessionId,
    saving,
    screen,
    setActiveExercises,
    setActivePlanId,
    setAddExerciseOpen,
    setAdvancedTimerOpen,
    setCardioEntries,
    setCompetitionSendError,
    setCompetitionSendStatus,
    setConfirmDialog,
    setContextMenuExerciseIndex,
    setCreateExerciseForAdd,
    setCreateExerciseForSubstituteIndex,
    setCreateExerciseOpen,
    setDurationPickerOpen,
    setEditingRestExerciseIndex,
    setError,
    setInfoDialog,
    setIntensityModeState,
    setIsWorkoutRunning,
    setLoadingShare,
    setManualTimerMinutes,
    setOpenRoutineMenuId,
    setOpenTypePicker,
    setPostCaption,
    setPostDone,
    setPostPrivacy,
    setPosting,
    setPrCelebration,
    setReorderSheetOpen,
    setRoutineFilter,
    setRoutineMenuAnchor,
    setScreen,
    setShareHighlights,
    setShareLinkModal,
    setSharePhoto,
    setSubstituteSourceIndex,
    setSummaryDurationMin,
    setSummaryName,
    setSupersetPickerSourceIndex,
    shareHighlights,
    shareLinkModal,
    sharePhoto,
    showRir,
    showRpe,
    startRestEdit,
    startedAt,
    streakDays,
    substituteSourceIndex,
    summaryDurationMin,
    summaryImageFile,
    summaryImagePreview,
    summaryName,
    supersetPickerSourceIndex,
    toggleRestTimer,
    totals,
    updatingPlanIds,
  } = useTrainSession()

  if (screen === 'SUMMARY') {
    return (
      <TrainSummaryScreen
        prByExerciseId={prByExerciseId}
        prSnapshotAtStart={prSnapshotAtStart}
        activeExercises={activeExercises}
        originMode={originMode}
        activePlanId={activePlanId}
        lastUseByPlanId={lastUseByPlanId}
        elapsedSec={elapsedSec}
        summaryDurationMin={summaryDurationMin}
        totals={totals}
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
        authorizedFetch={authorizedFetch}
        startedAt={startedAt}
        endedAt={endedAt}
        error={error}
        summaryName={summaryName}
        setSummaryName={setSummaryName}
        setSummaryDurationMin={setSummaryDurationMin}
        durationPickerOpen={durationPickerOpen}
        setDurationPickerOpen={setDurationPickerOpen}
        saving={saving}
        planUpdateDialog={planUpdateDialog}
        summaryImagePreview={summaryImagePreview}
        handleSummaryImage={handleSummaryImage}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        activeCompetition={activeCompetition}
        cardioEntries={cardioEntries}
        competitionSendStatus={competitionSendStatus}
        setCompetitionSendStatus={setCompetitionSendStatus}
        competitionSendError={competitionSendError}
        setCompetitionSendError={setCompetitionSendError}
        shareHighlights={shareHighlights}
        sharePhoto={sharePhoto}
        backToActiveTraining={backToActiveTraining}
        handleSaveClick={handleSaveClick}
        handlePlanUpdateApply={handlePlanUpdateApply}
        handlePlanUpdateKeep={handlePlanUpdateKeep}
      />
    )
  }

  if (screen === 'RECOMMENDATIONS') {
    return <TrainRecommendationsScreen onBack={() => setScreen('DASHBOARD')} />
  }

  if (screen === 'SEND_ROUTINE') {
    return (
      <TrainSendRoutineScreen
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={(data) => void handleCreateAndSendRoutine(data)}
      />
    )
  }

  if (screen === 'NEW_ROUTINE') {
    return (
      <TrainNewRoutineScreen
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={handleCreateRoutineSubmit}
      />
    )
  }

  if (screen === 'EDIT') {
    const editingPlan = plans.find((p) => p.id === activePlanId) ?? null
    return (
      <TrainEditRoutineScreen
        editingPlan={editingPlan}
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={handleEditRoutineSubmit}
      />
    )
  }

  if (screen === 'ACTIVE') {
    return (
      <TrainActiveScreen
        showRir={showRir}
        showRpe={showRpe}
        openTypePicker={openTypePicker}
        setOpenTypePicker={setOpenTypePicker}
        lastPerformanceByExercise={lastPerformanceByExercise}
        setActiveExercises={setActiveExercises}
        setContextMenuExerciseIndex={setContextMenuExerciseIndex}
        startRestEdit={startRestEdit}
        patchSet={patchSet}
        completeSet={completeSet}
        removeSet={removeSet}
        addSet={addSet}
        addSetCopyingPrevious={addSetCopyingPrevious}
        addDropEntry={addDropEntry}
        removeDropEntry={removeDropEntry}
        patchDropEntry={patchDropEntry}
        advancedTimerOpen={advancedTimerOpen}
        setAdvancedTimerOpen={setAdvancedTimerOpen}
        isWorkoutRunning={isWorkoutRunning}
        setIsWorkoutRunning={setIsWorkoutRunning}
        manualTimerMinutes={manualTimerMinutes}
        setManualTimerMinutes={setManualTimerMinutes}
        applyManualTimerEdit={applyManualTimerEdit}
        intensityMode={intensityMode}
        setIntensityModeState={setIntensityModeState}
        activeExercises={activeExercises}
        activePlanName={activePlanName}
        displayElapsedSec={displayElapsedSec}
        totals={totals}
        error={error}
        prCelebration={prCelebration}
        setPrCelebration={setPrCelebration}
        restFinishedName={restFinishedName}
        adjustRestTimer={adjustRestTimer}
        toggleRestTimer={toggleRestTimer}
        backToDashboardFromActive={backToDashboardFromActive}
        finalizeWithSafetyCheck={finalizeWithSafetyCheck}
        dndSensors={dndSensors}
        handleExerciseDragEnd={handleExerciseDragEnd}
        editingRestExerciseIndex={editingRestExerciseIndex}
        setEditingRestExerciseIndex={setEditingRestExerciseIndex}
        applyRestEdit={applyRestEdit}
        contextMenuExerciseIndex={contextMenuExerciseIndex}
        reorderSheetOpen={reorderSheetOpen}
        setReorderSheetOpen={setReorderSheetOpen}
        substituteSourceIndex={substituteSourceIndex}
        setSubstituteSourceIndex={setSubstituteSourceIndex}
        removeFromSuperset={removeFromSuperset}
        supersetPickerSourceIndex={supersetPickerSourceIndex}
        setSupersetPickerSourceIndex={setSupersetPickerSourceIndex}
        handleRemoveExercise={handleRemoveExercise}
        applySubstitution={applySubstitution}
        addExerciseToActiveWorkout={addExerciseToActiveWorkout}
        addExerciseOpen={addExerciseOpen}
        setAddExerciseOpen={setAddExerciseOpen}
        createExerciseOpen={createExerciseOpen}
        setCreateExerciseOpen={setCreateExerciseOpen}
        createExerciseForSubstituteIndex={createExerciseForSubstituteIndex}
        setCreateExerciseForSubstituteIndex={setCreateExerciseForSubstituteIndex}
        createExerciseForAdd={createExerciseForAdd}
        setCreateExerciseForAdd={setCreateExerciseForAdd}
        pairAsSuperset={pairAsSuperset}
        infoDialog={infoDialog}
        setInfoDialog={setInfoDialog}
        cardioEntries={cardioEntries}
        setCardioEntries={setCardioEntries}
        durationWarning={durationWarning}
        handleDurationAdjust={handleDurationAdjust}
        handleDurationKeepCurrent={handleDurationKeepCurrent}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />
    )
  }

  return (
    <TrainDashboardScreen
      streakDays={streakDays}
      hydrated={hydrated}
      activeExercises={activeExercises}
      mostRecentSession={mostRecentSession}
      plans={plans}
      activePlanName={activePlanName}
      error={error}
      routineFilter={routineFilter}
      setRoutineFilter={setRoutineFilter}
      loadingPlans={loadingPlans}
      shareLinkModal={shareLinkModal}
      setShareLinkModal={setShareLinkModal}
      beginEmptyTraining={beginEmptyTraining}
      beginRoutineTraining={beginRoutineTraining}
      lastUseByPlanId={lastUseByPlanId}
      optimisticPlanIds={optimisticPlanIds}
      updatingPlanIds={updatingPlanIds}
      openRoutineMenuId={openRoutineMenuId}
      routineMenuAnchor={routineMenuAnchor}
      setOpenRoutineMenuId={setOpenRoutineMenuId}
      setRoutineMenuAnchor={setRoutineMenuAnchor}
      setActivePlanId={setActivePlanId}
      setScreen={setScreen}
      handleDeleteRoutine={handleDeleteRoutine}
      handleShareRoutine={handleShareRoutine}
      handleDuplicateRoutine={handleDuplicateRoutine}
      handleExportPDF={handleExportPDF}
    />
  )
}
