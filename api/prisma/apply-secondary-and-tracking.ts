/// <reference types="node" />
import { PrismaClient, MuscleGroup } from "@prisma/client";

type ExerciseTrackingType = "REPS" | "TIME" | "DISTANCE" | "REPS_AND_TIME";
const ExerciseTrackingType = {
  REPS: "REPS" as const,
  TIME: "TIME" as const,
  DISTANCE: "DISTANCE" as const,
  REPS_AND_TIME: "REPS_AND_TIME" as const,
};

const prisma = new PrismaClient();

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Returns expected secondary muscle group, or "SKIP" to leave unchanged
function expectedSecondary(name: string, primary: string): MuscleGroup | null | "SKIP" {
  const n = norm(name);

  if (primary === "CHEST") {
    // Pullover engages lats → BACK takes precedence over null
    if (/(pullover)/.test(n)) return MuscleGroup.BACK;
    if (/\b(supino|flex[aã]o|mergulho|press no cabo|pike push)\b/.test(n)) return MuscleGroup.TRICEPS;
    if (/(crucifixo|crossover)/.test(n)) return null;
    return "SKIP";
  }

  if (primary === "BACK") {
    if (/(superman)/.test(n)) return null;
    if (/(barra fixa|puxada|remada|kelso|pullover)/.test(n)) return MuscleGroup.BICEPS;
    if (/(levantamento terra|rack pull)/.test(n)) return MuscleGroup.GLUTES;
    // Face pull engages rear delts but is primarily back; keep SKIP to preserve current value
    return "SKIP";
  }

  if (primary === "SHOULDERS") {
    if (/(desenvolvimento|pike push|caminhada na parede|flex[aã]o parada de m[aã]o|flex[aã]o pike|arnold press|press com kettlebell|press unilateral com halter)/.test(n)) return MuscleGroup.TRICEPS;
    if (/(remada alta)/.test(n)) return null;
    if (/(eleva[cç][aã]o|crucifixo inverso|rota[cç][aã]o|face pull)/.test(n)) return null;
    return "SKIP";
  }

  if (primary === "BICEPS") {
    // User override: ALL biceps curls engage forearm → keep/set FOREARM
    if (/(rosca|curl)/.test(n)) return MuscleGroup.FOREARM;
    return null;
  }

  if (primary === "TRICEPS") {
    if (/(mergulho nas paralel|paralela com sobrecarga|paralela|triceps banco|flex[aã]o diamante)/.test(n)) return MuscleGroup.CHEST;
    return null;
  }

  if (primary === "QUADS") {
    if (/(agachamento|hack squat|leg press|afundo|passada|step up|recuo|pistol squat|cadeira na parede)/.test(n)) return MuscleGroup.GLUTES;
    if (/(cadeira extensora)/.test(n)) return null;
    return "SKIP";
  }

  if (primary === "HAMSTRINGS") {
    if (/(stiff|levantamento terra romeno|good morning|deslizamento|flex[aã]o n[oó]rdica)/.test(n)) return MuscleGroup.GLUTES;
    if (/(cadeira flexora)/.test(n)) return null;
    if (/(levantamento terra convencional|levantamento terra(?! romeno))/.test(n)) return MuscleGroup.GLUTES;
    return "SKIP";
  }

  if (primary === "GLUTES") {
    if (/(hip thrust|eleva[cç][aã]o p[eé]lvica|ponte de gl[uú]teo|ponte gl[uú]tea|glute bridge|frog pump|levantamento terra romeno|good morning|pull through)/.test(n)) return MuscleGroup.HAMSTRINGS;
    if (/(agachamento|afundo|passada|step up|avanco|avanço)/.test(n)) return MuscleGroup.QUADS;
    if (/(coice|abdu[cç][aã]o|concha lateral)/.test(n)) return null;
    return "SKIP";
  }

  if (primary === "CALVES") return null;

  if (primary === "ABDOMEN" || primary === "CORE") {
    if (/(mountain climber|kettlebell swing)/.test(n)) return "SKIP";
    return null;
  }

  if (primary === "ADDUCTORS" || primary === "FOREARM" || primary === "LEGS") return null;

  return "SKIP";
}

// Time-tracked exercises
const TIME_EXERCISES = [
  "prancha frontal",
  "prancha lateral",
  "prancha",
  "hollow hold",
  "cadeira na parede",
  "caminhada na parede",
  "pegada isometrica na barra",
  "pegada isométrica na barra",
  "dead bug",
  "superman",
  "ponte de gluteo bilateral no chao",
];

// Distance-tracked exercises
const DISTANCE_EXERCISES = [
  "farmer walk com halteres",
  "farmer walk com barra",
];

function expectedTracking(name: string): ExerciseTrackingType {
  const n = norm(name);
  if (DISTANCE_EXERCISES.some((d) => n.includes(norm(d)))) return ExerciseTrackingType.DISTANCE;
  if (TIME_EXERCISES.some((t) => n.includes(norm(t)))) return ExerciseTrackingType.TIME;
  return ExerciseTrackingType.REPS;
}

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }],
  });

  let secondaryUpdates = 0;
  let trackingUpdates = 0;

  const secondaryChanges: Array<{ name: string; primary: string; from: MuscleGroup | null; to: MuscleGroup | null }> = [];
  const trackingChanges: Array<{ name: string; from: string; to: string }> = [];

  for (const e of all) {
    const data: Record<string, unknown> = {};

    // Secondary muscle
    const exp = expectedSecondary(e.name, e.primaryMuscleGroup);
    if (exp !== "SKIP") {
      const cur = e.secondaryMuscleGroup;
      if (cur !== exp) {
        data.secondaryMuscleGroup = exp;
        secondaryChanges.push({ name: e.name, primary: e.primaryMuscleGroup, from: cur, to: exp });
        secondaryUpdates++;
      }
    }

    // Tracking type
    const expTr = expectedTracking(e.name);
    if ((e as any).trackingType !== expTr) {
      data.trackingType = expTr;
      trackingChanges.push({ name: e.name, from: (e as any).trackingType ?? "REPS", to: expTr });
      trackingUpdates++;
    }

    if (Object.keys(data).length > 0) {
      await prisma.exercise.update({ where: { id: e.id }, data });
    }
  }

  console.log(`\n=== SECONDARY MUSCLE CHANGES: ${secondaryUpdates} ===`);
  for (const c of secondaryChanges) {
    console.log(`  [${c.primary.padEnd(10)}] ${c.name.padEnd(55)} | ${c.from ?? "null"} → ${c.to ?? "null"}`);
  }

  console.log(`\n=== TRACKING TYPE CHANGES: ${trackingUpdates} ===`);
  for (const c of trackingChanges) {
    console.log(`  ${c.name.padEnd(55)} | ${c.from} → ${c.to}`);
  }

  // Final stats
  const after = await prisma.exercise.findMany({ where: { scope: "GLOBAL", isActive: true } });
  const trackCounts = new Map<string, number>();
  for (const e of after) {
    const t = (e as any).trackingType ?? "REPS";
    trackCounts.set(t, (trackCounts.get(t) ?? 0) + 1);
  }
  console.log("\nDistribuição final de trackingType:");
  for (const [t, n] of [...trackCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${n}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
