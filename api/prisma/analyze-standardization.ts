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
      // Acronyms (exact uppercase like W)
      if (w.length === 1 && ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      // Proper nouns (Arnold, Smith, Scott, T machine)
      const titleCase = lc.charAt(0).toUpperCase() + lc.slice(1);
      if (PROPER_NOUNS.has(titleCase)) return titleCase;
      // Connectors stay lowercase (except if first word)
      if (i > 0 && LOWERCASE_CONNECTORS.has(lc)) return lc;
      // First word always TitleCase
      if (i === 0) return lc.charAt(0).toUpperCase() + lc.slice(1);
      // Everything else: lowercase
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

// Equipment inference. Order matters: most specific equipment hints first.
function inferEquipment(name: string, currentEq: string): string {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // KETTLEBELL
  if (/\bkettlebell\b/.test(n)) return "KETTLEBELL";

  // BAND
  if (/(mini band|elastico|\bband\b)/.test(n)) return "BAND";

  // SMITH and MACHINE markers (highest priority among non-free-weight)
  if (/(\bsmith\b|leg press|hack squat|peck deck|pec deck|articulada|m[aá]quina|landmine)/.test(n)) return "MACHINE";
  if (/\bcadeira (extensora|flexora|adutora|abdutora)\b/.test(n)) return "MACHINE";

  // CABLE (polia, cabo, crossover, pulldown, pulley, corda, face pull, pull through, puxada — lat pulldown)
  if (/(polia|crossover|pulldown|pulley|na corda|com corda|\bno cabo\b|cable|face pull|pull through|pull-through|\bpuxada\b|press no cabo)/.test(n))
    return "CABLE";

  // BARBELL — explicit barbell
  if (/(barra (w|reta|t|curvada)\b|com barra\b|na barra\b|levantamento terra|rack pull|good morning com barra|stiff com barra|farmer walk com barra|crucifixo no peck)/.test(n))
    return "BARBELL";

  // DUMBBELL — explicit halter, or shoulder-raise variants typically done with light DBs
  if (/(\bhalter\b|halteres|com alter|\belevacao y\b|\belevacao t\b|\belevacao w\b)/.test(n)) return "DUMBBELL";

  // BODYWEIGHT — true bodyweight movements
  if (
    /(\bbarra fixa\b|\bparalel|\bmergulho\b|\bflex[aã]o\b|\bprancha\b|mountain climber|hollow|dead bug|agachamento pistola|agachamento cossaco|agachamento livre sem peso|agachamento com salto|agachamento bulgaro|afundo bulgaro|afundo reverso|cadeira na parede|caminhada na parede|superman|quatro apoios|concha lateral|com salto|unilateral no step|glute bridge|deslizamento|\bhang\b|pendurado|pike push|remada invertida|triceps banco|abdominal canivete|abdominal bicicleta|abdominal supra|abdominal infra|flex[aã]o nordica|flex[aã]o n[oó]rdica|stiff unilateral sem peso|ponte de gl[uú]teo bilateral no ch[aã]o|frog pump|coice em quatro|abducao em quatro|ponte glutea|step up|russian twist|wall walk|sem peso|burpee)/.test(n)
  ) return "BODYWEIGHT";

  // Fallback: keep existing
  return currentEq;
}

function inferBodyweight(equipment: string): boolean {
  return equipment === "BODYWEIGHT";
}

// Conservative extraLoad: only obvious cases where adding weight is standard
function inferAllowsExtraLoad(name: string, equipment: string): boolean {
  if (equipment !== "BODYWEIGHT") return false;
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Movements where weighted vest / belt is normal
  if (/(barra fixa|paralel|mergulho|agachamento pistola|agachamento cossaco|flexao do arqueiro|flexao diamante|stiff unilateral|elevacao de pernas pendurado|hang|pendurado|caminhada na parede|cadeira na parede|abdominal canivete|russian twist|crunch)/.test(n)) return true;
  return false;
}

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
    orderBy: { name: "asc" },
  });

  console.log("=== A) MUDANÇAS DE NOME ===\n");
  const nameChanges: Array<{ id: string; from: string; to: string }> = [];
  for (const e of all) {
    const nn = transform(e.name);
    if (nn !== e.name) nameChanges.push({ id: e.id, from: e.name, to: nn });
  }
  console.log(`Total: ${nameChanges.length}\n`);
  for (const c of nameChanges) console.log(`  "${c.from}"  =>  "${c.to}"`);

  console.log("\n=== B) UPPERCASING DE equipment (TODOS os 210) ===\n");
  const eqUpperCount = new Map<string, number>();
  for (const e of all) {
    if (e.equipment !== e.equipment.toUpperCase()) {
      eqUpperCount.set(`${e.equipment} -> ${e.equipment.toUpperCase()}`, (eqUpperCount.get(`${e.equipment} -> ${e.equipment.toUpperCase()}`) ?? 0) + 1);
    }
  }
  for (const [k, v] of eqUpperCount) console.log(`  ${k}: ${v} linhas`);

  console.log("\n=== C) CORREÇÕES DE equipment / flags nos meus 73 (cmoxah) ===\n");
  const mine = all.filter((e) => e.id.startsWith("cmoxah"));
  const flagChanges: Array<{ name: string; cur: { eq: string; bw: boolean; ex: boolean }; next: { eq: string; bw: boolean; ex: boolean } }> = [];
  for (const e of mine) {
    const curEqUp = e.equipment.toUpperCase();
    const eq = inferEquipment(e.name, curEqUp);
    const bw = inferBodyweight(eq);
    const ex = inferAllowsExtraLoad(e.name, eq);
    if (eq !== curEqUp || bw !== e.isBodyweight || ex !== e.allowsExtraLoad) {
      flagChanges.push({ name: e.name, cur: { eq: curEqUp, bw: e.isBodyweight, ex: e.allowsExtraLoad }, next: { eq, bw, ex } });
    }
  }
  console.log(`Total: ${flagChanges.length}\n`);
  for (const c of flagChanges) {
    const parts: string[] = [];
    if (c.cur.eq !== c.next.eq) parts.push(`eq: ${c.cur.eq} -> ${c.next.eq}`);
    if (c.cur.bw !== c.next.bw) parts.push(`bw: ${c.cur.bw} -> ${c.next.bw}`);
    if (c.cur.ex !== c.next.ex) parts.push(`extraLoad: ${c.cur.ex} -> ${c.next.ex}`);
    console.log(`  ${c.name.padEnd(50)} | ${parts.join(" | ")}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
