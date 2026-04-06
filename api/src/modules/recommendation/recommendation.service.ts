import {
  AllowedDivision,
  RecommendationDay,
  RecommendationExercise,
  WorkoutRecommendation
} from "./recommendation.schema";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

type GenderFocus = "UNISEX" | "FEMALE" | "MALE";
type UserSex = "MALE" | "FEMALE" | "OTHER";
type DifficultyTier = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

type ExerciseSource = {
  id: string;
  name: string;
  primaryMuscleGroup:
    | "FULL_BODY"
    | "CHEST"
    | "BACK"
    | "SHOULDERS"
    | "ARMS"
    | "BICEPS"
    | "TRICEPS"
    | "CORE"
    | "ABDOMEN"
    | "FOREARM"
    | "GLUTES"
    | "LEGS"
    | "CALVES";
  genderFocus: GenderFocus;
  difficultyTier: DifficultyTier;
};

type FocusTemplate = {
  focus: string;
  muscleGroups: Array<
    | "FULL_BODY"
    | "CHEST"
    | "BACK"
    | "SHOULDERS"
    | "ARMS"
    | "BICEPS"
    | "TRICEPS"
    | "CORE"
    | "ABDOMEN"
    | "FOREARM"
    | "GLUTES"
    | "LEGS"
    | "CALVES"
  >;
};

type DivisionTemplate = {
  division: AllowedDivision;
  rationale: string;
  baseFocus: FocusTemplate[];
};

const DIVISION_LIBRARY: Record<AllowedDivision, DivisionTemplate> = {
  "Full Body": {
    division: "Full Body",
    rationale: "Melhor uso para baixa disponibilidade semanal, estimulando o corpo inteiro com alta frequencia.",
    baseFocus: [
      { focus: "Full Body A", muscleGroups: ["CHEST", "BACK", "LEGS", "SHOULDERS", "CORE"] },
      { focus: "Full Body B", muscleGroups: ["GLUTES", "BACK", "LEGS", "CHEST", "ABDOMEN"] }
    ]
  },
  "Push Pull Legs": {
    division: "Push Pull Legs",
    rationale: "Equilibrio entre volume e recuperacao com separacao por padrao de movimento.",
    baseFocus: [
      { focus: "Push", muscleGroups: ["CHEST", "SHOULDERS", "TRICEPS"] },
      { focus: "Pull", muscleGroups: ["BACK", "BICEPS", "FOREARM"] },
      { focus: "Legs", muscleGroups: ["LEGS", "GLUTES", "CALVES"] }
    ]
  },
  "Upper Lower": {
    division: "Upper Lower",
    rationale: "Divisao simples para consolidar tecnica e progresso em 2 a 4 dias.",
    baseFocus: [
      { focus: "Upper", muscleGroups: ["CHEST", "BACK", "SHOULDERS", "ARMS"] },
      { focus: "Lower", muscleGroups: ["LEGS", "GLUTES", "CALVES", "CORE"] }
    ]
  },
  "Push Pull Legs 2x": {
    division: "Push Pull Legs 2x",
    rationale: "Alta frequencia para praticantes com mais dias disponiveis e foco em volume semanal.",
    baseFocus: [
      { focus: "Push 1", muscleGroups: ["CHEST", "SHOULDERS", "TRICEPS"] },
      { focus: "Pull 1", muscleGroups: ["BACK", "BICEPS", "FOREARM"] },
      { focus: "Legs 1", muscleGroups: ["LEGS", "GLUTES", "CALVES"] },
      { focus: "Push 2", muscleGroups: ["CHEST", "SHOULDERS", "TRICEPS"] },
      { focus: "Pull 2", muscleGroups: ["BACK", "BICEPS", "FOREARM"] },
      { focus: "Legs 2", muscleGroups: ["LEGS", "GLUTES", "CALVES"] }
    ]
  },
  "Upper Lower 2x": {
    division: "Upper Lower 2x",
    rationale: "Repeticao estruturada para melhorar progressao de carga e tecnica no mesmo microciclo.",
    baseFocus: [
      { focus: "Upper 1", muscleGroups: ["CHEST", "BACK", "SHOULDERS", "ARMS"] },
      { focus: "Lower 1", muscleGroups: ["LEGS", "GLUTES", "CALVES", "CORE"] },
      { focus: "Upper 2", muscleGroups: ["CHEST", "BACK", "SHOULDERS", "ARMS"] },
      { focus: "Lower 2", muscleGroups: ["LEGS", "GLUTES", "CALVES", "ABDOMEN"] }
    ]
  },
  "Torso Legs": {
    division: "Torso Legs",
    rationale: "Alternancia torso/pernas para reduzir fadiga local e distribuir melhor o esforco semanal.",
    baseFocus: [
      { focus: "Torso 1", muscleGroups: ["CHEST", "BACK", "SHOULDERS", "ARMS"] },
      { focus: "Legs 1", muscleGroups: ["LEGS", "GLUTES", "CALVES", "CORE"] },
      { focus: "Torso 2", muscleGroups: ["CHEST", "BACK", "SHOULDERS", "ARMS"] },
      { focus: "Legs 2", muscleGroups: ["LEGS", "GLUTES", "CALVES", "ABDOMEN"] }
    ]
  },
  "Bro Split": {
    division: "Bro Split",
    rationale: "Divisao por grupamento para maior foco local e maior volume por sessao.",
    baseFocus: [
      { focus: "Chest", muscleGroups: ["CHEST", "TRICEPS"] },
      { focus: "Back", muscleGroups: ["BACK", "BICEPS"] },
      { focus: "Shoulders", muscleGroups: ["SHOULDERS", "TRICEPS"] },
      { focus: "Arms", muscleGroups: ["BICEPS", "TRICEPS", "FOREARM"] },
      { focus: "Legs", muscleGroups: ["LEGS", "GLUTES", "CALVES"] }
    ]
  }
};

const DIVISION_BY_DAYS: Record<number, AllowedDivision[]> = {
  1: ["Full Body", "Upper Lower"],
  2: ["Full Body", "Upper Lower"],
  3: ["Push Pull Legs", "Full Body"],
  4: ["Upper Lower 2x", "Torso Legs"],
  5: ["Bro Split", "Push Pull Legs"],
  6: ["Push Pull Legs 2x", "Upper Lower 2x"],
  7: ["Push Pull Legs 2x", "Bro Split"]
};

function normalizeDays(value: number): number {
  if (value < 1) {
    return 1;
  }
  if (value > 7) {
    return 7;
  }
  return value;
}

function genderPriority(sex: UserSex): GenderFocus[] {
  if (sex === "MALE") {
    return ["MALE", "UNISEX"];
  }
  if (sex === "FEMALE") {
    return ["FEMALE", "UNISEX"];
  }
  return ["UNISEX"];
}

function toExerciseDto(exercise: ExerciseSource): RecommendationExercise {
  const prescriptionByTier: Record<
    DifficultyTier,
    { sets: number; reps: string; rir: number; restSeconds: number }
  > = {
    BEGINNER: { sets: 3, reps: "10-12", rir: 3, restSeconds: 75 },
    INTERMEDIATE: { sets: 4, reps: "8-10", rir: 2, restSeconds: 90 },
    ADVANCED: { sets: 4, reps: "6-8", rir: 1, restSeconds: 120 }
  };

  const prescription = prescriptionByTier[exercise.difficultyTier];

  return {
    id: exercise.id,
    name: exercise.name,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    genderFocus: exercise.genderFocus,
    difficultyTier: exercise.difficultyTier,
    sets: prescription.sets,
    reps: prescription.reps,
    rir: prescription.rir,
    restSeconds: prescription.restSeconds
  };
}

const FALLBACK_EXERCISE_CATALOG: ExerciseSource[] = [
  {
    id: "fb-chest-1",
    name: "Supino reto com barra",
    primaryMuscleGroup: "CHEST",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-chest-male-1",
    name: "Supino com pausa",
    primaryMuscleGroup: "CHEST",
    genderFocus: "MALE",
    difficultyTier: "ADVANCED"
  },
  {
    id: "fb-chest-female-1",
    name: "Flexao inclinada",
    primaryMuscleGroup: "CHEST",
    genderFocus: "FEMALE",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-back-1",
    name: "Remada baixa no cabo",
    primaryMuscleGroup: "BACK",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-back-2",
    name: "Puxada frente",
    primaryMuscleGroup: "BACK",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-shoulders-1",
    name: "Desenvolvimento com halteres",
    primaryMuscleGroup: "SHOULDERS",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-arms-1",
    name: "Rosca direta",
    primaryMuscleGroup: "BICEPS",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-arms-male-1",
    name: "Rosca 21",
    primaryMuscleGroup: "BICEPS",
    genderFocus: "MALE",
    difficultyTier: "ADVANCED"
  },
  {
    id: "fb-arms-female-1",
    name: "Rosca concentrada",
    primaryMuscleGroup: "BICEPS",
    genderFocus: "FEMALE",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-triceps-1",
    name: "Triceps corda",
    primaryMuscleGroup: "TRICEPS",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-triceps-male-1",
    name: "Triceps testa",
    primaryMuscleGroup: "TRICEPS",
    genderFocus: "MALE",
    difficultyTier: "ADVANCED"
  },
  {
    id: "fb-triceps-female-1",
    name: "Triceps coice",
    primaryMuscleGroup: "TRICEPS",
    genderFocus: "FEMALE",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-legs-1",
    name: "Agachamento livre",
    primaryMuscleGroup: "LEGS",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-legs-2",
    name: "Leg press",
    primaryMuscleGroup: "LEGS",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-glutes-1",
    name: "Hip thrust",
    primaryMuscleGroup: "GLUTES",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-glutes-female-1",
    name: "Abducao de quadril",
    primaryMuscleGroup: "GLUTES",
    genderFocus: "FEMALE",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-core-1",
    name: "Prancha frontal",
    primaryMuscleGroup: "CORE",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-abdomen-1",
    name: "Crunch no cabo",
    primaryMuscleGroup: "ABDOMEN",
    genderFocus: "UNISEX",
    difficultyTier: "INTERMEDIATE"
  },
  {
    id: "fb-calves-1",
    name: "Panturrilha em pe",
    primaryMuscleGroup: "CALVES",
    genderFocus: "UNISEX",
    difficultyTier: "BEGINNER"
  },
  {
    id: "fb-forearm-1",
    name: "Farmer walk",
    primaryMuscleGroup: "FOREARM",
    genderFocus: "UNISEX",
    difficultyTier: "ADVANCED"
  }
];

function inferDifficultyTier(exerciseName: string): DifficultyTier {
  const normalized = exerciseName.toLowerCase();

  if (
    /olimpico|snatch|clean|jerk|pistol|muscle up|terra|advanced|avancado|21/.test(normalized)
  ) {
    return "ADVANCED";
  }

  if (/supino|agachamento|remada|puxada|desenvolvimento|hip thrust|press/.test(normalized)) {
    return "INTERMEDIATE";
  }

  return "BEGINNER";
}

function getDifficultyForDay(daysPerWeek: number, dayIndex: number): DifficultyTier {
  if (daysPerWeek <= 2) {
    return "INTERMEDIATE";
  }

  if (daysPerWeek <= 4) {
    const cycle: DifficultyTier[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "INTERMEDIATE"];
    return cycle[dayIndex % cycle.length];
  }

  const cycle: DifficultyTier[] = [
    "BEGINNER",
    "INTERMEDIATE",
    "INTERMEDIATE",
    "ADVANCED",
    "ADVANCED",
    "INTERMEDIATE",
    "BEGINNER"
  ];
  return cycle[dayIndex % cycle.length];
}

function sexOffset(sex: UserSex): number {
  if (sex === "MALE") {
    return 1;
  }
  if (sex === "FEMALE") {
    return 2;
  }
  return 0;
}

function rotate<T>(values: T[], offset: number): T[] {
  if (values.length === 0) {
    return values;
  }

  const index = offset % values.length;
  return [...values.slice(index), ...values.slice(0, index)];
}

function buildWeekFocus(template: DivisionTemplate, daysPerWeek: number): FocusTemplate[] {
  const sessions: FocusTemplate[] = [];
  for (let day = 0; day < daysPerWeek; day += 1) {
    sessions.push(template.baseFocus[day % template.baseFocus.length]);
  }

  return sessions;
}

async function fetchExercisePool(sex: UserSex): Promise<ExerciseSource[]> {
  const allowedFocus = genderPriority(sex);

  const dbExercises = await prisma.exercise.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      name: true,
      primaryMuscleGroup: true
    },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }]
  });

  if (dbExercises.length > 0) {
    return dbExercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      primaryMuscleGroup: exercise.primaryMuscleGroup as ExerciseSource["primaryMuscleGroup"],
      genderFocus: "UNISEX",
      difficultyTier: inferDifficultyTier(exercise.name)
    }));
  }

  return FALLBACK_EXERCISE_CATALOG.filter((exercise) => allowedFocus.includes(exercise.genderFocus));
}

function pickExercisesForSession(
  session: FocusTemplate,
  exercisePool: ExerciseSource[],
  recommendationIndex: number,
  dayIndex: number,
  sex: UserSex,
  daysPerWeek: number,
  usedAcrossPlan: Set<string>
): RecommendationExercise[] {
  const preferredFocus = genderPriority(sex);
  const dayDifficulty = getDifficultyForDay(daysPerWeek, dayIndex);

  const selected: RecommendationExercise[] = [];
  const seenInDay = new Set<string>();

  for (const muscleGroup of session.muscleGroups) {
    const candidates = exercisePool.filter((exercise) => exercise.primaryMuscleGroup === muscleGroup);

    const byDifficulty = candidates.filter((exercise) => exercise.difficultyTier === dayDifficulty);
    const poolByTier = byDifficulty.length > 0 ? byDifficulty : candidates;

    const ordered = preferredFocus
      .flatMap((focus) => poolByTier.filter((exercise) => exercise.genderFocus === focus))
      .filter((exercise, index, array) => array.findIndex((item) => item.id === exercise.id) === index);

    const rotated = rotate(ordered, recommendationIndex + dayIndex + sexOffset(sex));
    let chosen = rotated.find(
      (exercise) => !seenInDay.has(exercise.id) && !usedAcrossPlan.has(exercise.id)
    );

    if (!chosen) {
      chosen = rotated.find((exercise) => !seenInDay.has(exercise.id));
    }

    if (chosen) {
      selected.push(toExerciseDto(chosen));
      seenInDay.add(chosen.id);
      usedAcrossPlan.add(chosen.id);
    }
  }

  if (selected.length >= 4) {
    return selected.slice(0, 6);
  }

  const fallback = rotate(
    exercisePool.filter((exercise) => !seenInDay.has(exercise.id)),
    recommendationIndex + dayIndex + sexOffset(sex)
  );

  for (const candidate of fallback) {
    if (usedAcrossPlan.has(candidate.id) && exercisePool.length > usedAcrossPlan.size + 3) {
      continue;
    }

    selected.push(toExerciseDto(candidate));
    seenInDay.add(candidate.id);
    usedAcrossPlan.add(candidate.id);
    if (selected.length >= 4) {
      break;
    }
  }

  return selected;
}

function buildRecommendation(
  template: DivisionTemplate,
  daysPerWeek: number,
  exercisePool: ExerciseSource[],
  recommendationIndex: number,
  sex: UserSex
): WorkoutRecommendation {
  const weekFocus = buildWeekFocus(template, daysPerWeek);
  const usedAcrossPlan = new Set<string>();

  const sessions: RecommendationDay[] = weekFocus.map((session, dayIndex) => ({
    dayNumber: dayIndex + 1,
    focus: session.focus,
    exercises: pickExercisesForSession(
      session,
      exercisePool,
      recommendationIndex,
      dayIndex,
      sex,
      daysPerWeek,
      usedAcrossPlan
    )
  }));

  return {
    division: template.division,
    daysPerWeek,
    rationale: template.rationale,
    selectionStrategy:
      "Seleciona do banco ativo por grupamento, reduz repeticao entre sessoes e progride dificuldade por dia via tier BEGINNER/INTERMEDIATE/ADVANCED.",
    sessions
  };
}

export async function getWorkoutRecommendationsForUser(userId: string): Promise<{
  inputs: {
    sex: UserSex;
    availableDaysPerWeek: number;
  };
  recommendations: WorkoutRecommendation[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      sex: true,
      availableDaysPerWeek: true,
      onboardingCompletedAt: true,
      isDeleted: true,
      status: true
    }
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  const onboardingCompleted = Boolean(user.onboardingCompletedAt && user.availableDaysPerWeek);
  if (!onboardingCompleted) {
    throw new AppError("Onboarding required before generating recommendations", {
      statusCode: 403,
      code: "ONBOARDING_REQUIRED"
    });
  }

  const daysPerWeek = normalizeDays(user.availableDaysPerWeek as number);
  const selectedDivisions = DIVISION_BY_DAYS[daysPerWeek] ?? ["Full Body", "Upper Lower"];

  const exercisePool = await fetchExercisePool(user.sex);
  const recommendations = selectedDivisions.slice(0, 2).map((division, index) =>
    buildRecommendation(DIVISION_LIBRARY[division], daysPerWeek, exercisePool, index, user.sex as UserSex)
  );

  return {
    inputs: {
      sex: user.sex as UserSex,
      availableDaysPerWeek: daysPerWeek
    },
    recommendations
  };
}
