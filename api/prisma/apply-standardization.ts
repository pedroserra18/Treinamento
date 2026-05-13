/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROPER_NOUNS = new Set(["Arnold", "Smith", "Kelso", "Scott", "T"]);
const ACRONYMS = new Set(["W", "Y", "T"]);
const LOWERCASE_CONNECTORS = new Set(["a", "à", "de", "do", "da", "no", "na", "com", "sem", "para", "em", "e"]);

function applyAccents(name: string): string {
  const r: Array<[RegExp, string]> = [
    [/\bAbducao\b/g, "Abdução"], [/\babducao\b/g, "abdução"],
    [/\bAducao\b/g, "Adução"],
    [/\bAvanco\b/g, "Avanço"], [/\bavanco\b/g, "avanço"],
    [/\bBulgaro\b/g, "Búlgaro"], [/\bbulgaro\b/g, "búlgaro"],
    [/\bChao\b/g, "Chão"], [/\bchao\b/g, "chão"],
    [/\bElevacao\b/g, "Elevação"], [/\belevacao\b/g, "elevação"],
    [/\bExtensao\b/g, "Extensão"], [/\bextensao\b/g, "extensão"],
    [/\bFlexao\b/g, "Flexão"], [/\bflexao\b/g, "flexão"],
    [/\bFrances\b/g, "Francês"], [/\bfrances\b/g, "francês"],
    [/\bGluteo\b/g, "Glúteo"], [/\bgluteo\b/g, "glúteo"],
    [/\bIsometrico\b/g, "Isométrico"], [/\bisometrico\b/g, "isométrico"],
    [/\bIsometrica\b/g, "Isométrica"], [/\bisometrica\b/g, "isométrica"],
    [/\bMao\b/g, "Mão"], [/\bmao\b/g, "mão"],
    [/\bMaquina\b/g, "Máquina"], [/\bmaquina\b/g, "máquina"],
    [/\bNordica\b/g, "Nórdica"], [/\bnordica\b/g, "nórdica"],
    [/\bPanturrilha em pe\b/g, "Panturrilha em pé"],
    [/\bem pe\b/g, "em pé"],
    [/\bPelvica\b/g, "Pélvica"], [/\bpelvica\b/g, "pélvica"],
    [/\bPliometrico\b/g, "Pliométrico"], [/\bpliometrico\b/g, "pliométrico"],
    [/\bPronacao\b/g, "Pronação"], [/\bpronacao\b/g, "pronação"],
    [/\bRotacao\b/g, "Rotação"], [/\brotacao\b/g, "rotação"],
    [/\bSupinacao\b/g, "Supinação"], [/\bsupinacao\b/g, "supinação"],
    [/\bTriceps\b/g, "Tríceps"], [/\btriceps\b/g, "tríceps"],
    [/\bBiceps\b/g, "Bíceps"], [/\bbiceps\b/g, "bíceps"],
  ];
  let out = name;
  for (const [p, s] of r) out = out.replace(p, s);
  return out;
}

function standardizeCase(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const words = trimmed.split(" ");
  return words
    .map((w, i) => {
      const lc = w.toLowerCase();
      if (w.length === 1 && ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      const titleCase = lc.charAt(0).toUpperCase() + lc.slice(1);
      if (PROPER_NOUNS.has(titleCase)) return titleCase;
      if (i > 0 && LOWERCASE_CONNECTORS.has(lc)) return lc;
      if (i === 0) return lc.charAt(0).toUpperCase() + lc.slice(1);
      return lc;
    })
    .join(" ");
}

function transform(name: string): string {
  let fixed = name.replace(/\bcom alter\b/g, "com halter");
  fixed = standardizeCase(fixed);
  fixed = applyAccents(fixed);
  return fixed;
}

function inferEquipment(name: string, currentEq: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\bkettlebell\b/.test(n)) return "KETTLEBELL";
  if (/(mini band|elastico|\bband\b)/.test(n)) return "BAND";
  if (/(\bsmith\b|leg press|hack squat|peck deck|pec deck|articulada|m[aá]quina|landmine)/.test(n)) return "MACHINE";
  if (/\bcadeira (extensora|flexora|adutora|abdutora)\b/.test(n)) return "MACHINE";
  if (/(polia|crossover|pulldown|pulley|na corda|com corda|\bno cabo\b|cable|face pull|pull through|pull-through|\bpuxada\b|press no cabo)/.test(n)) return "CABLE";
  if (/(barra (w|reta|t|curvada)\b|com barra\b|na barra\b|levantamento terra|rack pull|good morning com barra|stiff com barra|farmer walk com barra|crucifixo no peck)/.test(n)) return "BARBELL";
  if (/(\bhalter\b|halteres|com alter|\belevacao y\b|\belevacao t\b|\belevacao w\b)/.test(n)) return "DUMBBELL";
  if (
    /(\bbarra fixa\b|\bparalel|\bmergulho\b|\bflex[aã]o\b|\bprancha\b|mountain climber|hollow|dead bug|agachamento pistola|agachamento cossaco|agachamento livre sem peso|agachamento com salto|agachamento bulgaro|afundo bulgaro|afundo reverso|cadeira na parede|caminhada na parede|superman|quatro apoios|concha lateral|com salto|unilateral no step|glute bridge|deslizamento|\bhang\b|pendurado|pike push|remada invertida|triceps banco|abdominal canivete|abdominal bicicleta|abdominal supra|abdominal infra|flex[aã]o nordica|flex[aã]o n[oó]rdica|stiff unilateral sem peso|ponte de gl[uú]teo bilateral no ch[aã]o|frog pump|coice em quatro|abducao em quatro|ponte glutea|step up|russian twist|wall walk|sem peso|burpee)/.test(n)
  ) return "BODYWEIGHT";
  return currentEq;
}

function inferBodyweight(equipment: string): boolean {
  return equipment === "BODYWEIGHT";
}

function inferAllowsExtraLoad(name: string, equipment: string): boolean {
  if (equipment !== "BODYWEIGHT") return false;
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(barra fixa|paralel|mergulho|agachamento pistola|agachamento cossaco|flexao do arqueiro|flexao diamante|stiff unilateral|elevacao de pernas pendurado|hang|pendurado|caminhada na parede|cadeira na parede|abdominal canivete|russian twist|crunch)/.test(n)) return true;
  return false;
}

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
  });

  let nameUpdates = 0;
  let equipmentUppercased = 0;
  let flagUpdates = 0;

  for (const e of all) {
    const data: Record<string, unknown> = {};

    // 1. Name
    const newName = transform(e.name);
    if (newName !== e.name) {
      data.name = newName;
      nameUpdates++;
    }

    // 2. Equipment uppercasing (all 210)
    const curEqUp = e.equipment.toUpperCase();
    let newEq = curEqUp;
    if (curEqUp !== e.equipment) equipmentUppercased++;

    // 3. Inference + flags only for cmoxah
    if (e.id.startsWith("cmoxah")) {
      newEq = inferEquipment(e.name, curEqUp);
      const newBw = inferBodyweight(newEq);
      const newEx = inferAllowsExtraLoad(e.name, newEq);
      if (newEq !== curEqUp || newBw !== e.isBodyweight || newEx !== e.allowsExtraLoad) {
        flagUpdates++;
        data.equipment = newEq;
        data.isBodyweight = newBw;
        data.allowsExtraLoad = newEx;
      } else if (newEq !== e.equipment) {
        data.equipment = newEq;
      }
    } else {
      if (newEq !== e.equipment) data.equipment = newEq;
    }

    if (Object.keys(data).length > 0) {
      await prisma.exercise.update({ where: { id: e.id }, data });
    }
  }

  console.log(`[A] Nomes atualizados: ${nameUpdates}`);
  console.log(`[B] Equipment uppercased: ${equipmentUppercased}`);
  console.log(`[C] Equipment/flags corrigidos (cmoxah): ${flagUpdates}`);

  // Final sanity check
  const after = await prisma.exercise.findMany({ where: { scope: "GLOBAL", isActive: true } });
  const eqCounts = new Map<string, number>();
  for (const e of after) eqCounts.set(e.equipment, (eqCounts.get(e.equipment) ?? 0) + 1);
  console.log("\nDistribuição final de equipment:");
  for (const [eq, n] of [...eqCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${eq}: ${n}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
