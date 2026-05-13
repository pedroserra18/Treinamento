/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Returns expected secondary muscle group, or "ANY" to skip, or null for "should be null"
function expectedSecondary(name: string, primary: string): string | null | "SKIP" {
  const n = norm(name);

  // CHEST
  if (primary === "CHEST") {
    if (/\b(supino|flex[aã]o|mergulho|press no cabo|pike push)\b/.test(n)) return "TRICEPS";
    if (/(crucifixo|crossover|pullover)/.test(n)) return null;
    return "SKIP";
  }

  // BACK
  if (primary === "BACK") {
    if (/(superman)/.test(n)) return null;
    if (/(barra fixa|puxada|remada|kelso|pullover)/.test(n)) return "BICEPS";
    if (/(levantamento terra|rack pull)/.test(n)) return "GLUTES";
    return "SKIP";
  }

  // SHOULDERS
  if (primary === "SHOULDERS") {
    // Compound overhead presses
    if (/(desenvolvimento|pike push|caminhada na parede|flex[aã]o parada de m[aã]o|flex[aã]o pike|arnold press|press com kettlebell|press unilateral com halter)/.test(n)) return "TRICEPS";
    // Upright row / remada alta → traps focus, but no trap group → null
    if (/(remada alta)/.test(n)) return null;
    // Isolation
    if (/(eleva[cç][aã]o|crucifixo inverso|rota[cç][aã]o|face pull)/.test(n)) return null;
    return "SKIP";
  }

  // BICEPS
  if (primary === "BICEPS") {
    if (/(rosca martelo|rosca cruz|rosca inversa|rosca 21)/.test(n)) return "FOREARM";
    return null; // isolation
  }

  // TRICEPS
  if (primary === "TRICEPS") {
    if (/(mergulho nas paralel|paralela com sobrecarga|paralela|triceps banco|flex[aã]o diamante)/.test(n)) return "CHEST";
    return null; // isolation
  }

  // QUADS — squats and lunges → GLUTES
  if (primary === "QUADS") {
    if (/(agachamento|hack squat|leg press|afundo|passada|step up|recuo|pistol squat|cadeira na parede)/.test(n)) return "GLUTES";
    if (/(cadeira extensora)/.test(n)) return null; // isolation
    return "SKIP";
  }

  // HAMSTRINGS
  if (primary === "HAMSTRINGS") {
    if (/(stiff|levantamento terra romeno|good morning|deslizamento|flex[aã]o n[oó]rdica)/.test(n)) return "GLUTES";
    if (/(cadeira flexora)/.test(n)) return null;
    return "SKIP";
  }

  // GLUTES — many hinge movements → HAMSTRINGS
  if (primary === "GLUTES") {
    if (/(hip thrust|eleva[cç][aã]o p[eé]lvica|ponte de gl[uú]teo|ponte gl[uú]tea|glute bridge|frog pump|levantamento terra romeno|good morning|pull through)/.test(n)) return "HAMSTRINGS";
    if (/(agachamento|afundo|passada|step up|avanco|avanço)/.test(n)) return "QUADS";
    if (/(coice|abdu[cç][aã]o|concha lateral)/.test(n)) return null; // isolation
    return "SKIP";
  }

  // CALVES — isolation
  if (primary === "CALVES") return null;

  // ABDOMEN / CORE — mostly isolation
  if (primary === "ABDOMEN" || primary === "CORE") {
    if (/(mountain climber|kettlebell swing)/.test(n)) return "SKIP";
    return null;
  }

  // ADDUCTORS, FOREARM, LEGS — isolation
  if (primary === "ADDUCTORS" || primary === "FOREARM" || primary === "LEGS") return null;

  return "SKIP";
}

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }],
  });

  const issues: Array<{ id: string; name: string; primary: string; currentSec: string | null; expected: string | null; reason: string }> = [];

  for (const e of all) {
    const exp = expectedSecondary(e.name, e.primaryMuscleGroup);
    if (exp === "SKIP") continue;
    const cur = e.secondaryMuscleGroup;
    if (cur !== exp) {
      issues.push({
        id: e.id,
        name: e.name,
        primary: e.primaryMuscleGroup,
        currentSec: cur,
        expected: exp,
        reason: cur && exp ? "wrong" : cur ? "should be null" : "missing",
      });
    }
  }

  // Group issues by category
  const missing = issues.filter((i) => i.reason === "missing");
  const wrong = issues.filter((i) => i.reason === "wrong");
  const shouldBeNull = issues.filter((i) => i.reason === "should be null");

  console.log(`=== AUDITORIA DE MÚSCULOS SECUNDÁRIOS ===\n`);
  console.log(`Total de exercícios analisados: ${all.length}`);
  console.log(`Sem secundário (faltando): ${missing.length}`);
  console.log(`Secundário errado: ${wrong.length}`);
  console.log(`Tem secundário mas deveria ser null: ${shouldBeNull.length}`);

  if (missing.length > 0) {
    console.log("\n--- FALTANDO SECUNDÁRIO ---");
    for (const i of missing) {
      console.log(`  [${i.primary.padEnd(10)}] ${i.name.padEnd(50)} → propor: ${i.expected}`);
    }
  }

  if (wrong.length > 0) {
    console.log("\n--- SECUNDÁRIO ERRADO ---");
    for (const i of wrong) {
      console.log(`  [${i.primary.padEnd(10)}] ${i.name.padEnd(50)} | atual: ${i.currentSec} → propor: ${i.expected}`);
    }
  }

  if (shouldBeNull.length > 0) {
    console.log("\n--- DEVERIA SER NULL ---");
    for (const i of shouldBeNull) {
      console.log(`  [${i.primary.padEnd(10)}] ${i.name.padEnd(50)} | atual: ${i.currentSec} → propor: null`);
    }
  }

  // Also show ones I marked SKIP — for manual review
  console.log("\n--- NÃO ANALISADOS (regras não aplicam, verificação manual) ---");
  for (const e of all) {
    const exp = expectedSecondary(e.name, e.primaryMuscleGroup);
    if (exp === "SKIP") {
      console.log(`  [${e.primaryMuscleGroup.padEnd(10)}] ${e.name.padEnd(50)} | secundário atual: ${e.secondaryMuscleGroup ?? "null"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
