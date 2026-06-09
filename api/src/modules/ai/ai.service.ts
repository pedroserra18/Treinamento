import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { GenerateWorkoutBody, SaveAIHistoryBody, SaveAIWorkoutBody } from "./ai.schema";

// DB enum → label PT-BR (única fonte de verdade na pipeline).
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  CHEST: "PEITO",
  BACK: "COSTAS",
  SHOULDERS: "OMBROS",
  BICEPS: "BÍCEPS",
  TRICEPS: "TRÍCEPS",
  QUADS: "QUADRÍCEPS",
  HAMSTRINGS: "POSTERIOR DE COXA",
  GLUTES: "GLÚTEO",
  CALVES: "PANTURRILHA",
  CORE: "CORE",
  ABDOMEN: "ABDÔMEN",
  FOREARM: "ANTEBRAÇO",
  ARMS: "BRAÇOS",
  LEGS: "PERNAS",
  ADDUCTORS: "ADUTORES",
  FULL_BODY: "CORPO INTEIRO",
};

// Coverage exigida por tipo de dia. O validador usa isto para decidir se a IA
// cobriu todos os grupos obrigatórios — se faltar algum, retry com feedback.
// Coverage requirements per day type. Bro Split day labels (Peito/Costas/etc.)
// também aqui — sem isto, o validador não cataria quando a IA pula bíceps/tríceps
// nos dias Costas/Peito (que são secundários obrigatórios na regra do Bro Split).
const REQUIRED_GROUPS_BY_SPLIT_KEY: Record<string, string[]> = {
  "Full Body": ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS", "QUADRÍCEPS", "PANTURRILHA"],
  Upper: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS"],
  Lower: ["QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Push: ["PEITO", "OMBROS", "TRÍCEPS"],
  Pull: ["COSTAS", "BÍCEPS"],
  Legs: ["QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  // Bro Split — músculo principal + secundário obrigatório.
  Peito: ["PEITO", "TRÍCEPS"],
  Costas: ["COSTAS", "BÍCEPS"],
  Pernas: ["QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Ombros: ["OMBROS"],
  Braços: ["BÍCEPS", "TRÍCEPS"],
  // PPL + Lower Specialization — dias de pernas especializados (4 dias + 1x/sem + foco inferior).
  Quadríceps: ["QUADRÍCEPS"],
  Glúteo: ["GLÚTEO", "POSTERIOR DE COXA"],
  // Torso/Limbs — Torso = tronco; Limbs = braços + pernas.
  Torso: ["PEITO", "COSTAS", "OMBROS"],
  Limbs: ["BÍCEPS", "TRÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA"],
};

// Grupos PROIBIDOS por dia. Se um exercício do dia tem primário num desses
// grupos, o dia foi "contaminado" com músculos que não pertencem ali. Bug
// frequente em bodyweight, onde Pull tem poucas opções (4 BACK ex) e a IA
// preenche slots com PUSH (4 CHEST + 3 SHOULDERS bodyweight). ABDÔMEN/CORE
// nunca é proibido — pode complementar qualquer split.
const FORBIDDEN_GROUPS_BY_SPLIT_KEY: Record<string, string[]> = {
  Push: ["COSTAS", "BÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Pull: ["PEITO", "OMBROS", "TRÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Legs: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS"],
  Upper: ["QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Lower: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS"],
  // Bro Split
  Peito: ["COSTAS", "BÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Costas: ["PEITO", "OMBROS", "TRÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Ombros: ["PEITO", "COSTAS", "BÍCEPS", "TRÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Braços: ["PEITO", "COSTAS", "OMBROS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Pernas: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS"],
  // PPL + Lower Specialization
  Quadríceps: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS", "GLÚTEO", "POSTERIOR DE COXA"],
  Glúteo: ["PEITO", "COSTAS", "OMBROS", "BÍCEPS", "TRÍCEPS", "QUADRÍCEPS"],
  // Torso/Limbs — Torso = tronco (sem braços/pernas); Limbs = braços+pernas (sem tronco).
  Torso: ["BÍCEPS", "TRÍCEPS", "QUADRÍCEPS", "POSTERIOR DE COXA", "GLÚTEO", "PANTURRILHA"],
  Limbs: ["PEITO", "COSTAS", "OMBROS"],
  // Full Body intencionalmente vazio — pode incluir qualquer grupo.
};

const MIN_EXERCISES_BY_SPLIT_KEY: Record<string, number> = {
  "Full Body": 8,
  Upper: 7,
  Lower: 5,
  Push: 6,
  Pull: 5,
  Legs: 7,
  Peito: 5,
  Costas: 5,
  Pernas: 7,
  Ombros: 5,
  Braços: 6,
  Quadríceps: 4,
  Glúteo: 5,
  Torso: 6,
  Limbs: 6,
};

// Volume máximo por músculo por sessão — usado pelo validador.
const MAX_SETS_PER_MUSCLE_BY_SPLIT_KEY: Record<string, number> = {
  "Full Body": 5,
  Upper: 7,
  Lower: 7,
  Push: 10,
  Pull: 10,
  Legs: 10,
  "Bro Split": 14,
};

function detectSplitKey(dayLabel: string | undefined | null): string | null {
  if (!dayLabel) return null;
  const keys = Object.keys(REQUIRED_GROUPS_BY_SPLIT_KEY);
  return keys.find((k) => dayLabel.startsWith(k)) ?? null;
}

// Fallback: extrai o splitKey do texto do prompt quando o frontend não envia
// dayLabel (mantém retrocompatibilidade enquanto o frontend não é atualizado).
function detectSplitKeyFromPrompt(prompt: string): string | null {
  const match = prompt.match(/treino\s+"([^"]+)"/i);
  if (!match) return null;
  return detectSplitKey(match[1]);
}

// ───────────────────────────────────────────────────────────────────────────────
// OpenAI structured output: força a IA a devolver JSON exatamente neste shape.
// Strict mode requer todas as keys em "required" e additionalProperties: false.
// Não usa minimum/maximum (não suportado em strict mode) — limites são validados
// programaticamente em validateWorkout().
// ───────────────────────────────────────────────────────────────────────────────
const WORKOUT_OUTPUT_SCHEMA = {
  name: "workout_plan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      planName: { type: "string" },
      objective: { type: "string" },
      observations: { type: "array", items: { type: "string" } },
      selfCritique: {
        type: "object",
        properties: {
          violations: { type: "array", items: { type: "string" } },
          allClear: { type: "boolean" },
        },
        required: ["violations", "allClear"],
        additionalProperties: false,
      },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            sets: { type: "integer" },
            repsMin: { type: "integer" },
            repsMax: { type: "integer" },
            restSec: { type: "integer" },
            notes: { type: ["string", "null"] },
          },
          required: ["name", "sets", "repsMin", "repsMax", "restSec", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["planName", "objective", "observations", "selfCritique", "exercises"],
    additionalProperties: false,
  },
} as const;

type AIWorkoutOutput = {
  planName: string;
  objective: string;
  observations: string[];
  selfCritique: {
    violations: string[];
    allClear: boolean;
  };
  exercises: Array<{
    name: string;
    sets: number;
    repsMin: number;
    repsMax: number;
    restSec: number;
    notes: string | null;
  }>;
};

type ExerciseRecord = {
  name: string;
  primaryMuscleGroup: string;
  ptLabel: string;
  equipment: string;
  isCompound: boolean;
  isBodyweight: boolean;
  difficulty: string;
  secondaryMuscleGroup: string | null;
};

async function fetchExercises(userId?: string, equipment?: string): Promise<ExerciseRecord[]> {
  const where: Record<string, unknown> = {
    isActive: true,
    OR: [
      { scope: "GLOBAL" },
      ...(userId ? [{ scope: "PRIVATE" as const, ownerUserId: userId }] : []),
    ],
  };
  if (equipment === "Sem equipamento") {
    where.isBodyweight = true;
  }

  const exercises = await prisma.exercise.findMany({
    where,
    select: {
      name: true,
      primaryMuscleGroup: true,
      secondaryMuscleGroup: true,
      equipment: true,
      isCompound: true,
      isBodyweight: true,
      difficulty: true,
    },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }],
  });

  return exercises.map((ex) => ({
    name: ex.name,
    primaryMuscleGroup: ex.primaryMuscleGroup,
    ptLabel: MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup,
    equipment: ex.equipment ?? "",
    isCompound: ex.isCompound,
    isBodyweight: ex.isBodyweight,
    difficulty: ex.difficulty,
    secondaryMuscleGroup: ex.secondaryMuscleGroup,
  }));
}

function formatExerciseList(exercises: ExerciseRecord[]): string {
  const grouped: Record<string, string[]> = {};
  for (const ex of exercises) {
    if (!grouped[ex.ptLabel]) grouped[ex.ptLabel] = [];
    const tags: string[] = [];
    if (ex.isBodyweight) tags.push("PESO_CORPORAL");
    else if (ex.equipment) tags.push(ex.equipment.toUpperCase());
    tags.push(ex.isCompound ? "COMPOSTO" : "ISOLADO");
    tags.push(ex.difficulty);
    if (ex.secondaryMuscleGroup) {
      const sec = MUSCLE_GROUP_LABELS[ex.secondaryMuscleGroup] ?? ex.secondaryMuscleGroup;
      tags.push(`sec:${sec}`);
    }
    grouped[ex.ptLabel].push(`${ex.name} [${tags.join(", ")}]`);
  }
  return Object.entries(grouped)
    .map(([group, names]) => `${group}:\n  - ${names.join("\n  - ")}`)
    .join("\n");
}

// ───────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — XML-tagged + hierarquia de prioridades explícita no topo.
// Mantido constante entre chamadas para ativar prompt caching da OpenAI
// (cache hits a partir de ~1024 tokens de prefixo idêntico).
// ───────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
<role>
Você é um especialista em treinamento físico baseado em evidências (hipertrofia, força, controle de fadiga). Sua única tarefa: gerar UM dia de treino, em JSON estruturado, seguindo as regras abaixo.
</role>

<prioridades>
Quando regras conflitarem, segue esta ordem decrescente:
1. NUNCA inventar exercício fora da lista <exercicios_disponiveis>.
2. Cobrir todos os grupos obrigatórios da divisão.
3. Respeitar limites de séries por músculo/sessão.
4. Honrar pedido explícito do usuário (Pedido extra).
5. Aproximar duração total da pedida.
</prioridades>

<regras_criticas>
- Usa SOMENTE nomes EXATOS da lista (sem alterar capitalização, acentos ou pontuação).
- Não repetes o mesmo exercício no mesmo dia.
- Se receberes <exercicios_ja_usados>, evita esses nomes mas mantém TODOS os grupos obrigatórios cobertos (usa outro exercício do mesmo grupo).
- O array final de "exercises" deve refletir a versão CORRIGIDA — nunca devolves um array com violações que tu próprio detetaste.
- A SECÇÃO em que o exercício aparece em <exercicios_disponiveis> define o seu grupo muscular para efeitos de cobertura. Mesmo que o NOME sugira outro grupo (ex: "agachamento" parece quad mas pode estar listado em GLÚTEO), a SECÇÃO é autoritativa. Para cobrir QUADRÍCEPS, escolhe um exercício listado em QUADRÍCEPS — não um listado em GLÚTEO mesmo que o nome contenha "agachamento".
- DIA PERSONALIZADO: se o nome do dia na <tarefa> for livre (ex: "Peito e tríceps", "Pernas completo", "Pernas (ênfase glúteo)", "Superior completo"), interpreta-o LITERALMENTE — cobre exatamente os músculos mencionados, com 4-7 exercícios, sem forçar divisão padrão. Convenções:
  • "Superior completo" / "Upper completo" = PEITO + COSTAS + OMBROS + BÍCEPS + TRÍCEPS.
  • "Inferior completo" / "Pernas completo" = QUADRÍCEPS + POSTERIOR DE COXA + GLÚTEO + PANTURRILHA.
  • "(ênfase em X)" ou "foco em X" = X é o músculo DOMINANTE do dia: a MAIORIA dos exercícios é de X (3-4 ex) e os outros músculos do grupo entram com apenas 1 ex cada. Ex: "Pernas (ênfase glúteo)" → 3-4 ex de GLÚTEO + 1 de QUADRÍCEPS + 1 de POSTERIOR DE COXA + 1 de PANTURRILHA (o glúteo domina; não distribui igualmente).
  O nome do dia é a instrução de cobertura.
</regras_criticas>

<selecao_por_equipamento>
A seleção DEVE respeitar o campo "Local de treino" do <perfil_usuario>:
- "Academia (completa)" ou "Casa com equipamentos": PREFERE SEMPRE exercícios com carga externa (tags [BARRA], [HALTERES]/[DUMBBELL], [MÁQUINA]/[MACHINE], [CABO]/[CABLE], [SMITH], [KETTLEBELL]). É PROIBIDO escolher exercícios marcados [PESO_CORPORAL] quando existe variação com carga para o MESMO movimento na lista.
  Exceções (bodyweight permitido mesmo com equipamento):
    • Core/abdômen (prancha, abdominais — naturalmente sem carga).
    • Quando o usuário pediu o exercício específico em "Pedido extra".
    • Quando NÃO existe nenhuma variação com carga para aquele movimento.
  Exemplo: POSTERIOR DE COXA em academia → "Stiff com barra", "Stiff com halter", "Levantamento terra romeno" ou "Mesa flexora". NUNCA "Stiff unilateral sem peso".
- "Sem equipamento": usa SOMENTE exercícios [PESO_CORPORAL] (calistenia).
</selecao_por_equipamento>

<preferencias_exercicio>
DESENVOLVIMENTO DE OMBROS — ordem de preferência (usa o primeiro disponível na lista):
1. Desenvolvimento militar com barra (composto pesado bilateral)
2. Desenvolvimento com halteres sentado (estável, bilateral)
3. Desenvolvimento máquina / Desenvolvimento pegada neutra na máquina
4. Desenvolvimento sentado no Smith
5. Desenvolvimento Arnold (variação aceitável)
EVITA por padrão: "Desenvolvimento unilateral com halter". Só inclui a variante unilateral se o usuário pedir EXPLICITAMENTE em "Pedido extra" ou tiver lesão que justifique trabalho unilateral. Para os DEMAIS grupos, exercícios unilaterais (afundo búlgaro, remada serrote, etc.) continuam permitidos normalmente.
</preferencias_exercicio>

<cobertura_por_divisao>
FULL BODY (mín 8 ex): PEITO · OMBROS · COSTAS · BÍCEPS · TRÍCEPS · QUADRÍCEPS · POSTERIOR DE COXA ou GLÚTEO · PANTURRILHA · ABDÔMEN/CORE.
UPPER (mín 7): PEITO · OMBROS · COSTAS · BÍCEPS · TRÍCEPS · ABDÔMEN. SEM pernas (sem QUADRÍCEPS, POSTERIOR DE COXA, GLÚTEO, PANTURRILHA).
LOWER (mín 5): QUADRÍCEPS · POSTERIOR DE COXA · GLÚTEO · PANTURRILHA. SEM upper (sem PEITO, COSTAS, OMBROS, BÍCEPS, TRÍCEPS).
PUSH (mín 6): 2-3 PEITO + 2 OMBROS + 2 TRÍCEPS. PROIBIDO incluir COSTAS, BÍCEPS, PERNAS — escolhe APENAS exercícios cujo grupo primário seja PEITO, OMBROS ou TRÍCEPS. Se faltar opções (ex: bodyweight com poucos compostos), repete categoria/variação em vez de incluir grupo errado. CORE/ABDÔMEN é permitido como complemento.
PULL (mín 5): 3-4 COSTAS + 2 BÍCEPS. PROIBIDO incluir PEITO, OMBROS, TRÍCEPS, PERNAS — escolhe APENAS exercícios cujo grupo primário seja COSTAS ou BÍCEPS. Se em bodyweight (poucas opções), repete ângulos/pegadas (remada supinada → pronada → neutra) em vez de meter flexões. CORE/ABDÔMEN é permitido como complemento.
LEGS (mín 7): 2-3 QUADRÍCEPS + 1-2 POSTERIOR DE COXA + 1-2 GLÚTEO + 1 PANTURRILHA + 1 CORE. PROIBIDO incluir PEITO, COSTAS, OMBROS, BÍCEPS, TRÍCEPS.

BRO SPLIT — cada dia tem um músculo principal + um secundário OBRIGATÓRIO (não opcional). Quando o plano não tem dia próprio para Braços, bíceps e tríceps SÃO trabalhados como secundário nos dias Costas e Peito — esta cobertura é tão obrigatória quanto o músculo principal:
- Dia "Peito" (mín 5 ex): 4-5 ex de PEITO + 1-2 ex de TRÍCEPS (obrigatório).
- Dia "Costas" (mín 5 ex): 4-5 ex de COSTAS + 1-2 ex de BÍCEPS (obrigatório).
- Dia "Ombros" (mín 5 ex): 4-5 ex de OMBROS + 1-2 ex de TRAPÉZIO ou pescoço (face pull, encolhimento).
- Dia "Braços" (mín 6 ex): 3 ex de BÍCEPS + 3 ex de TRÍCEPS.
- Dia "Pernas" (mín 7 ex): 2-3 ex de QUADRÍCEPS + 1-2 ex de POSTERIOR DE COXA + 1-2 ex de GLÚTEO + 1 ex de PANTURRILHA + 1 ex de CORE.

TORSO/LIMBS (tronco/membros):
- Dia "Torso" (mín 6 ex): PEITO + COSTAS + OMBROS (+ abdômen opcional). PROIBIDO incluir braços (bíceps/tríceps como exercício principal) e pernas — eles vão no dia Limbs.
- Dia "Limbs" (mín 6 ex): BÍCEPS + TRÍCEPS + QUADRÍCEPS + POSTERIOR DE COXA (+ glúteo/panturrilha). PROIBIDO incluir peito/costas/ombros — esses vão no dia Torso.

PERNAS ESPECIALIZADAS (split "PPL + Lower Specialization" — 4 dias, foco inferior). Cada perna-dia tem cobertura RESTRITA — NÃO misturar quad e glúteo no mesmo dia:
- Dia "Quadríceps" (mín 4 ex, máx ~6): 3-5 ex QUAD-DOMINANTES (cadeira extensora, hack squat, leg press com pés baixos, agachamento frontal, sissy squat, afundo passada com pé curto) + 1 ex de PANTURRILHA. PROIBIDO incluir hip thrust, elevação pélvica, agachamento sumô, stiff, RDL, mesa flexora — esses são GLÚTEO/POSTERIOR e vão no outro dia.
- Dia "Glúteo + Posterior" (mín 5 ex, máx ~7): 2-3 ex GLÚTEO-DOMINANTES (hip thrust, elevação pélvica, agachamento sumô, kickback, abdução de quadril, glute bridge) + 2-3 ex POSTERIOR DE COXA (stiff, RDL, mesa flexora, leg curl, good morning) + opcional 1 ex de PANTURRILHA. PROIBIDO incluir agachamento livre/frontal, leg press pés baixos, cadeira extensora, hack squat — esses são QUAD e vão no outro dia.
</cobertura_por_divisao>

<variacao_entre_sessoes>
A/B/C do mesmo plano usam padrões diferentes:
- Full Body A horizontal | B vertical | C unilateral.
- Upper A push/pull horizontal | B push/pull vertical.
- Lower A dominante quad | B dominante glúteo.
- Push/Pull/Legs A/B alterna ângulos e exercícios.
NUNCA repete o mesmo exercício entre sessões A/B/C — mas SEMPRE cobre todos os grupos obrigatórios em cada sessão.
</variacao_entre_sessoes>

<volume>
LIMITE MÁX POR MÚSCULO POR SESSÃO: Full Body 5 · Upper/Lower 7 · PPL 10 · Bro Split 14.
ALVO: COSTAS/QUADRÍCEPS/GLÚTEO 4-5 séries (2-3 ex). PANTURRILHA/POSTERIOR 2-3 séries (1-2 ex). Outros 3 séries (1-2 ex).
FOCO MUSCULAR DO USUÁRIO (campo "Foco muscular" do <perfil_usuario> — pode ser LISTA de até 3): adiciona 1-2 ex extra para CADA músculo da lista (volume EXTRA — não substitui obrigatórios). Se o foco contiver músculos do dia atual, todos recebem o boost; se contiver músculos de outros dias, ignora para este dia específico.
</volume>

<pedido_extra>
Lê o campo "Pedido extra" do <perfil_usuario>:
- SUBSTITUIÇÃO ("o meu X é Y", "quero X como Y", "no dia N o X é Y") → Y é a ÚNICA cobertura do grupo Y nesse dia. Cancela volume extra do foco se for o mesmo músculo.
- ADIÇÃO ("adiciona Y", "inclui Y", "quero Y também") → mantém cobertura normal e adiciona Y.
- Mantém o nome e número de séries EXATOS do que foi pedido.
</pedido_extra>

<exercicios_snc>
Limite de séries por exercício de alto SNC (Levantamento terra convencional/sumo, Rack pull, Agachamento livre/frontal com barra, Remada curvada com barra, Stiff com barra, Good morning com barra, Desenvolvimento militar com barra):
- Iniciante/Intermediário: máx 2 séries.
- Avançado: máx 3 séries.
</exercicios_snc>

<reps_descanso>
REPS: usa SEMPRE a faixa do perfil (campo "Faixa de reps preferida"). COMPOSTO: faixa exata. ISOLADO: desloca +2 reps (ex: 5–9 → 7–11; 8–10 → 10–12), exceto se a faixa ≥12 (mantém).
DESCANSO: usa SEMPRE o tempo do perfil (campo "Descanso entre séries"). Conversão: 30s→30, 45s→45, 1min→60, 1min30s→90, 2min→120, 2min30s→150, 3min→180. Se "IA decide": força (≤6 reps)→180s, hipertrofia (7-12)→120s, resistência (≥13)→60s.
TÉCNICAS AVANÇADAS: usa APENAS as técnicas que aparecem no campo "Técnicas avançadas autorizadas". Se o campo não estiver presente ou estiver vazio, NÃO inventes técnicas avançadas. NUNCA misturas técnicas que não foram pedidas (ex: se autorizado só Drop Set, NÃO incluas Cluster).
NOTES: cue técnico curto (≤60 chars) em 3-5 exercícios chave por dia (compostos pesados ou primeiro ex do grupo). Demais ex: notes=null.
</reps_descanso>

<progressao>
Se o <historico_cargas> estiver presente, o usuário já treinou esses exercícios. Para os exercícios do plano que aparecem no histórico, prescreve PROGRESSÃO no campo notes: parte da carga registrada e sugere o próximo passo realista (ex: "Última: 40kg x 8. Tenta 42,5kg ou +1 rep"). Incremento conservador: 2,5–5kg em compostos, 1–2,5kg em isolados, ou +1-2 reps mantendo a carga. NUNCA sugiras saltos grandes (>10%). Exercícios SEM histórico: notes técnico normal (ver <reps_descanso>), sem inventar carga. Bodyweight (sem equipamento): progressão por reps/dificuldade, não por carga. A dica de progressão substitui o cue técnico quando ambos caberiam — escolhe a progressão.
</progressao>

<ordem>
1. Músculo de FOCO primeiro (mesmo se isolado).
2. Compostos pesados antes de isolados.
3. Grupos grandes antes de pequenos (peito/costas antes de bíceps/tríceps).
4. Core/abdômen por último.
</ordem>

<contexto_especial>
INICIANTE (<1 ano): sem técnicas avançadas, RIR 2-4, máquinas guiadas preferidas, compostos básicos. 2-3 séries efetivas após aquecimentos.
LESÃO/RECUPERAÇÃO: 12-20 reps leves, RIR 3+ sem falha, sem técnicas avançadas, exclui exercícios que toquem a região lesionada.
BODYWEIGHT (sem equipamento): AMRAP até falha técnica próxima. Progressões corporais. Descanso 30-90s. Sem cargas, sem técnicas avançadas.
</contexto_especial>

<protocolos_lesao>
Quando o campo "Lesões/restrições" do <perfil_usuario> mencionar uma lesão, aplica o protocolo correspondente. É PROIBIDO incluir exercício contraindicado pela lesão, mesmo que seja obrigatório para cobertura — nesse caso substitui por uma alternativa segura do MESMO grupo.

JOELHO — LCA (ligamento cruzado anterior) e/ou MENISCO:
- EVITAR (contraindicado): agachamento profundo (abaixo de 90° de flexão), cadeira extensora com carga pesada em amplitude final (cadeia aberta nos últimos 30°), QUALQUER exercício com salto/pliometria (agachamento com salto pliométrico, afundo com salto), movimentos com rotação/pivô do joelho sob carga, afundo búlgaro em amplitude profunda, agachamento pistola, hack squat e leg press em amplitude profunda.
- PREFERIR (seguro): cadeia fechada com amplitude CONTROLADA até ~90° (leg press com ROM parcial, agachamento até paralela ou box squat, agachamento no Smith controlado), cadeira extensora LEVE com reps altas (12-15) só se amplitude parcial, ÊNFASE em POSTERIOR DE COXA e GLÚTEO (isquiotibiais e glúteos estabilizam e protegem o joelho): mesa flexora, stiff leve, levantamento terra romeno leve, ponte/elevação pélvica de glúteo, abdução de quadril, cadeira/mesa flexora. Tempo controlado, sem falha.
- MENISCO especificamente: evita flexão profunda COMBINADA com rotação e qualquer torção sob carga.
- LCA especificamente: evita extensão de joelho de cadeira aberta com carga pesada na amplitude terminal; prioriza fortalecimento de isquiotibiais/glúteos e cadeia fechada controlada.
- Em AMBAS (LCA + menisco): combina as duas listas — sê ainda mais conservador, amplitude parcial, cargas leves/moderadas, foco em controle e posterior/glúteo.

OMBRO (manguito rotador, impacto): evita desenvolvimento militar atrás da nuca, elevação lateral acima de 90° com carga pesada, supino com pegada muito aberta. Prefere desenvolvimento neutro/halteres, face pull, elevação lateral parcial, rotação externa leve.

LOMBAR (hérnia, dor lombar): evita levantamento terra convencional pesado, agachamento livre pesado, good morning, remada curvada com barra livre. Prefere variações apoiadas (leg press, cadeira, remada apoiada no peito, hip thrust com controle), core anti-extensão (prancha).
</protocolos_lesao>

<aquecimento>
Inclui sempre nas "observations" 1 dica sobre 2 séries de aproximação no primeiro composto pesado do dia (50% e 75% da carga de trabalho).
</aquecimento>

<auto_critica>
ANTES de finalizar o array de "exercises", verificas mentalmente as regras e preenches "selfCritique":
- "violations": lista QUALQUER violação que detetes (ex: "Faltou PEITO", "Repeti Agachamento livre", "8 séries de peito > limite 5 para Full Body").
- "allClear": true se violations está vazio; false caso contrário.

Se "allClear" for false, CORRIGES o array de "exercises" para resolver TODAS as violações ANTES de finalizar. O array final NÃO contém violações — o campo "violations" reporta o que foi detetado e corrigido (ou fica vazio se nada foi detetado).
</auto_critica>

<exemplo_full_body>
{
  "planName": "Full Body A",
  "objective": "Hipertrofia geral, ênfase horizontal.",
  "observations": [
    "Aquecimento: 2 séries de aproximação no supino (50% e 75%).",
    "Progressão: aumenta 2.5kg quando atingires o topo da faixa em todas as séries."
  ],
  "selfCritique": { "violations": [], "allClear": true },
  "exercises": [
    {"name":"Supino reto com barra","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":"escápulas retraídas"},
    {"name":"Remada curvada com barra","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":"controla a excêntrica"},
    {"name":"Desenvolvimento com halteres","sets":3,"repsMin":8,"repsMax":10,"restSec":90,"notes":null},
    {"name":"Agachamento livre","sets":3,"repsMin":6,"repsMax":8,"restSec":150,"notes":"joelho alinhado ao pé"},
    {"name":"Stiff com halteres","sets":3,"repsMin":10,"repsMax":12,"restSec":90,"notes":null},
    {"name":"Rosca direta com barra","sets":3,"repsMin":10,"repsMax":12,"restSec":60,"notes":null},
    {"name":"Tríceps pulley corda","sets":3,"repsMin":10,"repsMax":12,"restSec":60,"notes":null},
    {"name":"Panturrilha em pé","sets":3,"repsMin":12,"repsMax":15,"restSec":45,"notes":null},
    {"name":"Prancha frontal","sets":3,"repsMin":30,"repsMax":45,"restSec":45,"notes":"core contraído"}
  ]
}
</exemplo_full_body>

<exemplo_push>
{
  "planName": "Push A",
  "objective": "Push horizontal — ênfase peito médio + tríceps.",
  "observations": ["Aquecimento: 2 séries de aproximação no supino (50% e 75%)."],
  "selfCritique": { "violations": [], "allClear": true },
  "exercises": [
    {"name":"Supino reto com barra","sets":4,"repsMin":6,"repsMax":8,"restSec":150,"notes":"escápulas retraídas"},
    {"name":"Supino inclinado com halteres","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":null},
    {"name":"Crucifixo na máquina","sets":3,"repsMin":10,"repsMax":12,"restSec":75,"notes":null},
    {"name":"Desenvolvimento com halteres","sets":3,"repsMin":8,"repsMax":10,"restSec":90,"notes":null},
    {"name":"Elevação lateral com halteres","sets":3,"repsMin":12,"repsMax":15,"restSec":60,"notes":null},
    {"name":"Tríceps testa com halteres","sets":3,"repsMin":10,"repsMax":12,"restSec":75,"notes":null},
    {"name":"Tríceps pulley corda","sets":3,"repsMin":10,"repsMax":12,"restSec":60,"notes":null}
  ]
}
</exemplo_push>

<exemplo_lower>
{
  "planName": "Lower A",
  "objective": "Lower dominante quadríceps.",
  "observations": ["Aquecimento: 2 séries de aproximação no agachamento (50% e 75%)."],
  "selfCritique": { "violations": [], "allClear": true },
  "exercises": [
    {"name":"Agachamento livre","sets":4,"repsMin":6,"repsMax":8,"restSec":180,"notes":"joelho alinhado ao pé"},
    {"name":"Leg press 45°","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":null},
    {"name":"Cadeira extensora","sets":3,"repsMin":10,"repsMax":12,"restSec":75,"notes":null},
    {"name":"Stiff com barra","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":"controla a excêntrica"},
    {"name":"Hip thrust com barra","sets":3,"repsMin":10,"repsMax":12,"restSec":90,"notes":null},
    {"name":"Mesa flexora","sets":3,"repsMin":10,"repsMax":12,"restSec":75,"notes":null},
    {"name":"Panturrilha em pé","sets":4,"repsMin":12,"repsMax":15,"restSec":45,"notes":null}
  ]
}
</exemplo_lower>

Usa o exemplo correspondente à divisão pedida como referência de estrutura — adapta os exercícios à lista <exercicios_disponiveis> e ao <perfil_usuario>.
`.trim();

// ───────────────────────────────────────────────────────────────────────────────
// Histórico de cargas — progressão.
// Busca o melhor desempenho recente do usuário por exercício (carga máxima
// registrada e as reps atingidas nela) a partir do WorkoutHistory. A IA usa
// isto pra prescrever uma dica de progressão realista no campo `notes`, já que
// o plano em si não guarda carga-alvo.
// ───────────────────────────────────────────────────────────────────────────────
async function fetchRecentLoads(userId: string): Promise<string> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.workoutHistory.findMany({
    where: { userId, weightKg: { not: null, gt: 0 }, completedAt: { gte: since } },
    select: { weightKg: true, reps: true, exercise: { select: { name: true } } },
    orderBy: { completedAt: "desc" },
    take: 400,
  });

  // Melhor carga por exercício (e reps alcançadas nessa carga máxima).
  const best = new Map<string, { weight: number; reps: number | null }>();
  for (const r of rows) {
    const name = r.exercise?.name;
    const weight = r.weightKg ?? 0;
    if (!name || weight <= 0) continue;
    const current = best.get(name);
    if (!current || weight > current.weight) {
      best.set(name, { weight, reps: r.reps ?? null });
    }
  }

  if (best.size === 0) return "";

  const lines = Array.from(best.entries()).map(([name, { weight, reps }]) =>
    reps ? `- ${name}: ${weight}kg x ${reps} reps` : `- ${name}: ${weight}kg`
  );
  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────────────────────────
// User message — lista de exercícios + perfil + tarefa.
// Posta DEPOIS do system prompt para maximizar cache hits no prefixo.
// ───────────────────────────────────────────────────────────────────────────────
// Constrói a mensagem user_message com TODOS os campos estruturados num único
// <perfil_usuario>. Sem duplicação com a <tarefa> — cada resposta do quiz tem
// um lugar único e claro pra IA consumir.
function buildUserMessage(
  payload: GenerateWorkoutBody,
  exerciseListFormatted: string,
  recentLoads?: string
): string {
  const params: string[] = [];

  // ─── Estrutura do plano ────────────────────────────────────────────────
  if (payload.weekDays) params.push(`Frequência semanal: ${payload.weekDays} dias/semana`);
  if (payload.split) params.push(`Divisão escolhida: ${payload.split}`);
  if (payload.muscleFrequency && payload.muscleFrequency !== "IA decide") {
    params.push(`Frequência por músculo: ${payload.muscleFrequency}`);
  }

  // ─── Perfil demográfico ────────────────────────────────────────────────
  if (payload.level) params.push(`Nível de experiência: ${payload.level}`);
  if (payload.age) params.push(`Faixa etária: ${payload.age}`);
  if (payload.gender) params.push(`Gênero: ${payload.gender}`);
  if (payload.heightCm) params.push(`Altura: ${payload.heightCm}cm`);
  if (payload.weightKg) params.push(`Peso: ${payload.weightKg}kg`);

  // ─── Periodização ──────────────────────────────────────────────────────
  if (payload.phase) params.push(`Fase atual: ${payload.phase}`);
  if (payload.goal) params.push(`Objetivo principal: ${payload.goal}`);

  // ─── Local e equipamento ───────────────────────────────────────────────
  if (payload.equipment) params.push(`Local de treino: ${payload.equipment}`);
  if (payload.equipmentPreference) {
    // Só faz sentido em academia/casa COM equipamentos. Em "Sem equipamento"
    // (bodyweight), preferência por máquinas/pesos livres é irrelevante.
    const hint =
      payload.equipmentPreference === "Pesos livres"
        ? "priorizar halteres/barras/cabos sobre máquinas guiadas"
        : payload.equipmentPreference === "Máquinas"
          ? "priorizar máquinas guiadas sobre pesos livres"
          : "combinar pesos livres e máquinas conforme o exercício";
    params.push(`Preferência de equipamento: ${payload.equipmentPreference} (${hint})`);
  }

  // ─── Estrutura da sessão ───────────────────────────────────────────────
  if (payload.durationMin) params.push(`Duração disponível: ${payload.durationMin} minutos`);
  if (payload.exerciseCount && payload.exerciseCount !== "IA decide") {
    const hint =
      payload.exerciseCount === "Curto"
        ? "4-5 exercícios"
        : payload.exerciseCount === "Médio"
          ? "6-7 exercícios"
          : "8-10 exercícios";
    params.push(`Tamanho desejado: ${payload.exerciseCount} (${hint}) — respeita cobertura obrigatória mesmo assim`);
  }

  // ─── Prescrição ────────────────────────────────────────────────────────
  if (payload.repRange) params.push(`Faixa de reps preferida: ${payload.repRange}`);
  if (payload.restTime) {
    params.push(
      payload.restTime === "IA decide"
        ? `Descanso entre séries: IA decide (usar regra do prompt)`
        : `Descanso entre séries: ${payload.restTime}`
    );
  }
  if (payload.rirTarget && payload.rirTarget !== "IA decide") {
    const hint =
      payload.rirTarget === "Falha"
        ? "próximo da falha em isolados; RIR 1 em compostos pesados"
        : payload.rirTarget === "RIR 1-2"
          ? "1-2 reps na reserva"
          : "3+ reps na reserva, foco em técnica";
    params.push(`RIR alvo: ${payload.rirTarget} (${hint})`);
  }
  if (payload.techniques && payload.techniques.length > 0) {
    // Lista EXATA do que o usuário pediu — não inventar técnicas adicionais
    // ("Drop Set e/ou Cluster" era genérico demais e induzia a IA a incluir
    // técnicas que o usuário não escolheu).
    params.push(`Técnicas avançadas autorizadas: ${payload.techniques.join(", ")} (use APENAS estas, não inventes outras)`);
  }

  // ─── Foco e restrições ─────────────────────────────────────────────────
  if (payload.musclesFocus && payload.musclesFocus.length > 0) {
    // Lista completa — antes só o primeiro ia estruturado, agora todos.
    // Cada músculo na lista recebe volume EXTRA, sem substituir cobertura.
    params.push(`Foco muscular (volume EXTRA em CADA um): ${payload.musclesFocus.join(", ")}`);
  }
  if (payload.injuries) params.push(`Lesões/restrições: ${payload.injuries}`);

  // ─── Pedido específico em texto livre ──────────────────────────────────
  // Label "Pedido extra" casa com o <pedido_extra> do system prompt que
  // explica como interpretar (substituição vs adição).
  if (payload.extraInfo) {
    params.push(`Pedido extra: "${payload.extraInfo}"`);
  }

  let msg = `<exercicios_disponiveis>\nUsa APENAS estes (nomes EXATOS):\n${exerciseListFormatted}\n</exercicios_disponiveis>\n\n`;

  if (params.length > 0) {
    msg += `<perfil_usuario>\n${params.map((p) => "- " + p).join("\n")}\n</perfil_usuario>\n\n`;
  }

  if (recentLoads) {
    msg += `<historico_cargas>\nMelhor carga recente do usuário por exercício (últimos 90 dias). Usa pra prescrever progressão realista no campo notes — ver <progressao>:\n${recentLoads}\n</historico_cargas>\n\n`;
  }

  if (payload.usedExercises && payload.usedExercises.length > 0) {
    msg += `<exercicios_ja_usados>\nNão repetes nenhum destes (são de outros dias do plano):\n${payload.usedExercises
      .map((e) => "- " + e)
      .join("\n")}\n</exercicios_ja_usados>\n\n`;
  }

  msg += `<tarefa>\n${payload.prompt}\n</tarefa>`;

  return msg;
}

// ───────────────────────────────────────────────────────────────────────────────
// Validador programático — autoritativo. Se a IA violar, retry com feedback.
// ───────────────────────────────────────────────────────────────────────────────
function validateWorkout(
  workout: AIWorkoutOutput,
  splitKey: string | null,
  exerciseNameToMuscle: Map<string, string>,
  allowedNamesLower: Map<string, string>, // lower → canonical
  maxSetsPerMuscle: number,
  // Mapa do músculo SECUNDÁRIO por exercício. Em bodyweight (treino sem
  // equipamento), bíceps/tríceps quase não têm isoladores próprios — são
  // trabalhados via remada supinada/barra fixa (BACK + sec BICEPS) e via
  // flexões/dips (CHEST + sec TRICEPS). Quando isBodyweight=true, o
  // validador aceita o secundário como cobertura — caso contrário, o
  // aviso "Faltam: Bíceps" seria sempre falso positivo em calistenia.
  exerciseNameToSecondaryMuscle: Map<string, string>,
  isBodyweight: boolean,
  // Mapa nome → isBodyweight, usado para detetar exercício de peso corporal
  // num treino COM equipamento (bug: "Stiff unilateral sem peso" em academia).
  exerciseNameToBodyweight: Map<string, boolean>,
  // extraInfo do usuário em minúsculas — se ele pediu o exercício de propósito,
  // não tratamos como violação.
  extraInfoLower: string
): string[] {
  const violations: string[] = [];

  // 1. Nomes pertencem à lista.
  for (const ex of workout.exercises) {
    if (!allowedNamesLower.has(ex.name.toLowerCase())) {
      violations.push(`Exercício "${ex.name}" não existe na lista permitida.`);
    }
  }

  // 2. Sem duplicatas.
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    const key = ex.name.toLowerCase();
    if (seen.has(key)) {
      violations.push(`Exercício "${ex.name}" duplicado no mesmo dia.`);
    }
    seen.add(key);
  }

  // 3. Cobertura + min count (só se conhecemos o splitKey).
  if (splitKey && REQUIRED_GROUPS_BY_SPLIT_KEY[splitKey]) {
    const required = REQUIRED_GROUPS_BY_SPLIT_KEY[splitKey];
    const covered = new Set<string>();
    for (const ex of workout.exercises) {
      const key = ex.name.toLowerCase();
      const primary = exerciseNameToMuscle.get(key);
      if (primary) covered.add(primary);
      // Em bodyweight, secundário também conta — única forma realista de
      // cobrir bíceps/tríceps sem cargas externas.
      if (isBodyweight) {
        const secondary = exerciseNameToSecondaryMuscle.get(key);
        if (secondary) covered.add(secondary);
      }
    }
    for (const grp of required) {
      if (!covered.has(grp)) {
        violations.push(`Grupo obrigatório "${grp}" não coberto na divisão ${splitKey}.`);
      }
    }

    const minCount = MIN_EXERCISES_BY_SPLIT_KEY[splitKey] ?? 5;
    if (workout.exercises.length < minCount) {
      violations.push(`Mínimo de ${minCount} exercícios para ${splitKey} — recebeu ${workout.exercises.length}.`);
    }
  }

  // 3b. Grupos proibidos pelo tipo de dia. Catch típico: Pull bodyweight
  // recebendo flexões/dips porque a IA fica sem opções de costas e preenche
  // com push. Mesma lógica para Push recebendo remadas, etc.
  if (splitKey && FORBIDDEN_GROUPS_BY_SPLIT_KEY[splitKey]) {
    const forbidden = new Set(FORBIDDEN_GROUPS_BY_SPLIT_KEY[splitKey]);
    for (const ex of workout.exercises) {
      const primary = exerciseNameToMuscle.get(ex.name.toLowerCase());
      if (primary && forbidden.has(primary)) {
        violations.push(`Exercício "${ex.name}" (grupo ${primary}) não pertence a um dia de ${splitKey} — escolhe outro do grupo correto.`);
      }
    }
  }

  // 3c. Exercício de peso corporal num treino COM equipamento. Catch típico:
  // "Stiff unilateral sem peso" numa academia completa. Permitido: core/abdômen
  // (naturalmente sem carga) e exercícios que o usuário pediu explicitamente.
  if (!isBodyweight) {
    for (const ex of workout.exercises) {
      const key = ex.name.toLowerCase();
      if (!exerciseNameToBodyweight.get(key)) continue; // não é peso corporal
      const primary = exerciseNameToMuscle.get(key);
      if (primary === "CORE" || primary === "ABDÔMEN") continue; // permitido
      if (extraInfoLower && extraInfoLower.includes(key)) continue; // pedido explícito
      violations.push(`Exercício "${ex.name}" é de peso corporal, mas o usuário tem equipamento — usa a variação com carga (barra/halter/máquina) do mesmo movimento.`);
    }
  }

  // 4. Volume máximo por músculo (sempre conta pelo primário — secundário
  // não acumula séries efetivas suficientes pra estourar limite).
  const setsByMuscle = new Map<string, number>();
  for (const ex of workout.exercises) {
    const m = exerciseNameToMuscle.get(ex.name.toLowerCase());
    if (m) setsByMuscle.set(m, (setsByMuscle.get(m) ?? 0) + ex.sets);
  }
  for (const [muscle, sets] of setsByMuscle.entries()) {
    if (sets > maxSetsPerMuscle) {
      violations.push(`Volume excessivo em ${muscle}: ${sets} séries > limite ${maxSetsPerMuscle}.`);
    }
  }

  return violations;
}

// ───────────────────────────────────────────────────────────────────────────────
// Serializa o JSON estruturado de volta no formato "texto + markers" que o
// frontend atual sabe parsear. Mantém retrocompatibilidade total — Phase 2 vai
// migrar o frontend para consumir o JSON diretamente.
// ───────────────────────────────────────────────────────────────────────────────
// Enriquece cada exercício com `muscleGroup` da DB ao serializar para o frontend.
// Isto evita que o frontend faça regex no nome do exercício para descobrir
// o grupo muscular (detectMuscleGroup) — passa a ler ex.muscleGroup direto.
// Forçamos a IA a NÃO classificar (evita erros) e usamos o valor autoritativo
// da DB pelo lookup pós-geração.
function formatWorkoutAsLegacyText(
  workout: AIWorkoutOutput,
  exerciseNameToMuscle: Map<string, string>,
  exerciseNameToSecondaryMuscle: Map<string, string>
): string {
  const lines: string[] = [];
  lines.push(`## ${workout.planName}`);
  if (workout.objective) {
    lines.push(`**Objetivo:** ${workout.objective}\n`);
  }
  if (workout.observations.length > 0) {
    lines.push(`**Observações:**`);
    for (const obs of workout.observations) lines.push(`- ${obs}`);
    lines.push("");
  }
  if (workout.selfCritique.allClear) {
    lines.push(`**Auto-crítica:** Nenhuma violação detetada.\n`);
  } else if (workout.selfCritique.violations.length > 0) {
    lines.push(`**Auto-crítica:**`);
    for (const v of workout.selfCritique.violations) lines.push(`- ${v}`);
    lines.push("");
  }

  const payload = {
    planName: workout.planName,
    exercises: workout.exercises.map((ex) => {
      const key = ex.name.toLowerCase();
      const muscleGroup = exerciseNameToMuscle.get(key);
      const secondaryMuscleGroup = exerciseNameToSecondaryMuscle.get(key);
      return {
        name: ex.name,
        sets: ex.sets,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        restSec: ex.restSec,
        ...(ex.notes !== null && ex.notes !== "" ? { notes: ex.notes } : {}),
        ...(muscleGroup ? { muscleGroup } : {}),
        // Frontend usa o secundário pra validar cobertura em bodyweight
        // (ex: bíceps coberto por remada supinada).
        ...(secondaryMuscleGroup ? { secondaryMuscleGroup } : {}),
      };
    }),
  };

  lines.push("---WORKOUT_DATA_START---");
  lines.push(JSON.stringify(payload));
  lines.push("---WORKOUT_DATA_END---");

  return lines.join("\n");
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "A chave da API OpenAI não está configurada. Adiciona OPENAI_API_KEY ao ficheiro .env do servidor.",
      { statusCode: 503, code: "AI_NOT_CONFIGURED" }
    );
  }
  return new OpenAI({ apiKey });
}

async function callOpenAI(
  client: OpenAI,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
): Promise<AIWorkoutOutput> {
  // gpt-4o-2024-11-20+ tem melhor aderência a regras e suporta json_schema strict.
  // Pode ser sobrescrito por OPENAI_MODEL para A/B test com o3-mini etc.
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-2024-11-20";

  const response = await client.chat.completions.create({
    model,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: WORKOUT_OUTPUT_SCHEMA,
    },
    // Tarefa regrada e determinística — temperatura baixa reduz variação espúria
    // sem prejudicar criatividade necessária.
    temperature: 0.15,
    top_p: 0.9,
    // Best-effort determinismo: mesmas inputs tendem a gerar mesma saída.
    seed: 42,
    // Output real fica ~1500-2500 tokens; 4000 dá folga sem desperdiçar budget.
    max_tokens: 4000,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new AppError("A IA não devolveu resposta. Tenta novamente.", {
      statusCode: 502,
      code: "AI_EMPTY_RESPONSE",
    });
  }

  try {
    return JSON.parse(content) as AIWorkoutOutput;
  } catch {
    // Com response_format json_schema isto é praticamente impossível, mas
    // proteção defensiva.
    throw new AppError("A IA devolveu JSON inválido. Tenta novamente.", {
      statusCode: 502,
      code: "AI_INVALID_JSON",
    });
  }
}

export async function generateWorkout(payload: GenerateWorkoutBody, userId?: string): Promise<string> {
  const client = getOpenAIClient();

  const exercises = await fetchExercises(userId, payload.equipment);
  const exerciseListFormatted = formatExerciseList(exercises);

  // Lookups case-insensitive para validação tolerante (a IA pode capitalizar
  // diferente ocasionalmente — não tratamos isso como violação se o match é claro).
  // Mantemos mapa SEPARADO para músculo secundário; usado pelo validator em
  // modo bodyweight (ver doc na assinatura de validateWorkout).
  const exerciseNameToMuscle = new Map<string, string>();
  const exerciseNameToSecondaryMuscle = new Map<string, string>();
  const exerciseNameToBodyweight = new Map<string, boolean>();
  const allowedNamesLower = new Map<string, string>();
  for (const ex of exercises) {
    const key = ex.name.toLowerCase();
    exerciseNameToMuscle.set(key, ex.ptLabel);
    allowedNamesLower.set(key, ex.name);
    exerciseNameToBodyweight.set(key, ex.isBodyweight);
    if (ex.secondaryMuscleGroup) {
      const secLabel = MUSCLE_GROUP_LABELS[ex.secondaryMuscleGroup] ?? ex.secondaryMuscleGroup;
      exerciseNameToSecondaryMuscle.set(key, secLabel);
    }
  }

  // Divisão "Outro" (escrita livre pelo usuário) → splitKey null: a IA
  // interpreta o dayLabel literalmente (ex: "Peito e tríceps") e o validador
  // pula as checagens de cobertura/grupos-proibidos (não há divisão padrão
  // pra comparar). Demais checagens (nomes, duplicatas, bodyweight, volume)
  // continuam ativas.
  const splitKey =
    payload.split === "Outro"
      ? null
      : detectSplitKey(payload.dayLabel) ?? detectSplitKeyFromPrompt(payload.prompt);
  const maxSetsPerMuscle =
    payload.split === "Bro Split"
      ? MAX_SETS_PER_MUSCLE_BY_SPLIT_KEY["Bro Split"]
      : splitKey
        ? MAX_SETS_PER_MUSCLE_BY_SPLIT_KEY[splitKey] ?? 10
        : 10;
  const isBodyweight = payload.equipment === "Sem equipamento";
  const extraInfoLower = (payload.extraInfo ?? "").toLowerCase();

  // Progressão: injeta as melhores cargas recentes do usuário (se houver
  // histórico) pra IA prescrever incremento realista no campo notes.
  const recentLoads = userId ? await fetchRecentLoads(userId) : "";
  const userMsg = buildUserMessage(payload, exerciseListFormatted, recentLoads);

  let workout = await callOpenAI(client, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMsg },
  ]);

  let violations = validateWorkout(
    workout,
    splitKey,
    exerciseNameToMuscle,
    allowedNamesLower,
    maxSetsPerMuscle,
    exerciseNameToSecondaryMuscle,
    isBodyweight,
    exerciseNameToBodyweight,
    extraInfoLower
  );

  // Auto-retry uma vez se o validador encontrou problemas. Manda o output
  // anterior + lista de violações para a IA se auto-corrigir.
  if (violations.length > 0) {
    const retryMsg = `A geração anterior teve as seguintes violações (validação programática):
${violations.map((v) => "- " + v).join("\n")}

Gera de novo respeitando TODAS as regras. Lista vazia em selfCritique.violations se conseguires corrigir tudo.`;

    workout = await callOpenAI(client, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
      { role: "assistant", content: JSON.stringify(workout) },
      { role: "user", content: retryMsg },
    ]);

    violations = validateWorkout(
      workout,
      splitKey,
      exerciseNameToMuscle,
      allowedNamesLower,
      maxSetsPerMuscle,
      exerciseNameToSecondaryMuscle,
      isBodyweight,
      exerciseNameToBodyweight,
      extraInfoLower
    );
  }

  // Mesmo após retry pode sobrar alguma violação — preserva a lista autoritativa
  // do nosso validador em vez da auto-avaliação da IA. Frontend mostra ao user.
  if (violations.length > 0) {
    workout.selfCritique = { violations, allClear: false };
  }

  // Normaliza capitalização: se a IA escreveu "supino reto" e o canónico é
  // "Supino reto com barra", o save vai bater igual. Faz isto APÓS validação
  // para não mascarar erros reais.
  workout.exercises = workout.exercises.map((ex) => {
    const canonical = allowedNamesLower.get(ex.name.toLowerCase());
    return canonical ? { ...ex, name: canonical } : ex;
  });

  return formatWorkoutAsLegacyText(workout, exerciseNameToMuscle, exerciseNameToSecondaryMuscle);
}

// ───────────────────────────────────────────────────────────────────────────────
// Interpreta uma descrição de divisão em LINGUAGEM NATURAL e devolve a lista de
// dias. Usado quando o usuário escolhe "Outro" e escreve algo como "quero um
// dia só pra tríceps e bíceps, outro dia só pra ombro, um dia pra peito e
// costas e o último pra perna". O parser regex do frontend não dá conta de
// frase natural — aqui a IA faz o trabalho e o frontend gera dia a dia normal.
// ───────────────────────────────────────────────────────────────────────────────
const SPLIT_PARSE_SCHEMA = {
  name: "split_days",
  strict: true,
  schema: {
    type: "object",
    properties: {
      days: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            // Dia da semana abreviado se o usuário citou (SEG/TER/QUA/QUI/SEX/SÁB/DOM); "" se não.
            weekday: { type: "string" },
          },
          required: ["label", "weekday"],
          additionalProperties: false,
        },
      },
    },
    required: ["days"],
    additionalProperties: false,
  },
} as const;

export type ParsedSplitDay = { label: string; weekday: string };

export async function parseCustomSplitWithAI(description: string, daysPerWeek: number): Promise<ParsedSplitDay[]> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-2024-11-20";

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          'Você converte uma descrição de divisão de treino (em português, linguagem natural) numa lista ORDENADA de dias. ' +
          'Cada item descreve o foco daquele dia PRESERVANDO os qualificadores que o usuário mencionou (ex: "completo", "ênfase em glúteo", "foco em peito superior"). ' +
          'Cada item é um objeto {"label","weekday"}. ' +
          'label: nomes de músculos/regiões E as ênfases/qualificadores que o usuário mencionou (ex: "Pernas completo", "Pernas (ênfase glúteo)", "Superior completo", "Peito e Tríceps"). NÃO inclui dia da semana, "dia"/"treino" nem numeração no label. ' +
          'weekday: o dia da semana ABREVIADO que o usuário citou para esse treino, um de SEG/TER/QUA/QUI/SEX/SÁB/DOM. Se o usuário não citou dia da semana, usa "". ' +
          'Se o usuário pedir o mesmo tipo de treino em dias diferentes, cria um item para CADA dia, na ordem cronológica da semana (SEG→DOM). ' +
          'NÃO inventes dias que o usuário não pediu. ' +
          'Exemplo: "segunda e sábado perna completa, terça e sexta superior completo, quarta perna com ênfase em glúteo" → ' +
          '{"days":[{"label":"Pernas completo","weekday":"SEG"},{"label":"Superior completo","weekday":"TER"},{"label":"Pernas (ênfase glúteo)","weekday":"QUA"},{"label":"Superior completo","weekday":"SEX"},{"label":"Pernas completo","weekday":"SÁB"}]}. ' +
          'Responde SOMENTE com o JSON no formato {"days":[...]} na ordem cronológica da semana.',
      },
      {
        role: "user",
        content: `Frequência informada: ${daysPerWeek} dias/semana.\nDescrição do usuário: "${description}"\n\nDevolve a lista de dias na ordem descrita.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: SPLIT_PARSE_SCHEMA },
    temperature: 0.1,
    max_tokens: 400,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new AppError("A IA não conseguiu interpretar a divisão. Tenta reescrever.", {
      statusCode: 502,
      code: "AI_SPLIT_PARSE_FAILED",
    });
  }

  let parsed: { days?: unknown };
  try {
    parsed = JSON.parse(content) as { days?: unknown };
  } catch {
    throw new AppError("A IA devolveu formato inválido ao interpretar a divisão.", {
      statusCode: 502,
      code: "AI_SPLIT_PARSE_INVALID",
    });
  }

  const VALID_DOW = new Set(["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]);
  const days: ParsedSplitDay[] = Array.isArray(parsed.days)
    ? parsed.days
        .map((d): ParsedSplitDay | null => {
          if (!d || typeof d !== "object") return null;
          const obj = d as Record<string, unknown>;
          const label = typeof obj.label === "string" ? obj.label.trim() : "";
          if (!label) return null;
          const wkRaw = typeof obj.weekday === "string" ? obj.weekday.trim().toUpperCase() : "";
          return { label, weekday: VALID_DOW.has(wkRaw) ? wkRaw : "" };
        })
        .filter((d): d is ParsedSplitDay => d !== null)
        .slice(0, 7)
    : [];

  if (days.length === 0) {
    throw new AppError("Não consegui identificar os dias na descrição. Tenta detalhar mais.", {
      statusCode: 422,
      code: "AI_SPLIT_PARSE_EMPTY",
    });
  }

  return days;
}

// PT label → enum DB (reverso de MUSCLE_GROUP_LABELS). Usado pra trocar
// exercício por outro do mesmo grupo.
const PT_LABEL_TO_ENUM: Record<string, string> = Object.fromEntries(
  Object.entries(MUSCLE_GROUP_LABELS).map(([enumKey, ptLabel]) => [ptLabel, enumKey])
);

// Troca um exercício por OUTRO do mesmo grupo muscular, sem usar IA (query
// direta no banco) — instantâneo e não consome geração. Exclui os exercícios
// já presentes no dia e respeita o filtro de peso corporal (sem equipamento).
export async function swapExercise(
  userId: string | undefined,
  payload: { muscleGroup: string; equipment?: string; exclude?: string[] }
): Promise<{ name: string; muscleGroup: string; secondaryMuscleGroup: string | null }> {
  const enumGroup = PT_LABEL_TO_ENUM[payload.muscleGroup.toUpperCase()] ?? payload.muscleGroup;

  const where: Record<string, unknown> = {
    isActive: true,
    primaryMuscleGroup: enumGroup,
    OR: [
      { scope: "GLOBAL" },
      ...(userId ? [{ scope: "PRIVATE" as const, ownerUserId: userId }] : []),
    ],
    name: { notIn: payload.exclude ?? [] },
  };
  if (payload.equipment === "Sem equipamento") {
    where.isBodyweight = true;
  }

  const candidates = await prisma.exercise.findMany({
    where,
    select: { name: true, primaryMuscleGroup: true, secondaryMuscleGroup: true },
  });

  if (candidates.length === 0) {
    throw new AppError("Não há outro exercício disponível desse grupo.", {
      statusCode: 404,
      code: "NO_ALTERNATIVE_EXERCISE",
    });
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    name: pick.name,
    muscleGroup: MUSCLE_GROUP_LABELS[pick.primaryMuscleGroup] ?? pick.primaryMuscleGroup,
    secondaryMuscleGroup: pick.secondaryMuscleGroup
      ? MUSCLE_GROUP_LABELS[pick.secondaryMuscleGroup] ?? pick.secondaryMuscleGroup
      : null,
  };
}

type SavedExercise = {
  name: string;
  found: boolean;
  exerciseId?: string;
};

export async function saveAIWorkout(
  userId: string,
  payload: SaveAIWorkoutBody
): Promise<{ planId: string; planName: string; savedExercises: SavedExercise[] }> {
  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: payload.planName,
      description: "Gerado por IA",
      status: "ACTIVE",
      // Tag de agrupamento — quando o cliente envia o mesmo aiGenerationId
      // em múltiplos saves, os planos passam a ser listáveis como UMA
      // geração no endpoint /workouts/plans/ai/recent.
      aiGenerationId: payload.aiGenerationId ?? null,
      aiGenerationLabel: payload.aiGenerationLabel ?? null,
    },
  });

  const savedExercises: SavedExercise[] = [];
  let orderIndex = 1;

  for (const exerciseInput of payload.exercises) {
    const found = await prisma.exercise.findFirst({
      where: {
        isActive: true,
        OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
        name: { equals: exerciseInput.name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (!found) {
      const fallback = await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { contains: exerciseInput.name, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });

      savedExercises.push({ name: exerciseInput.name, found: !!fallback, exerciseId: fallback?.id });

      if (fallback) {
        await prisma.workoutPlanExercise.create({
          data: {
            workoutPlanId: plan.id,
            exerciseId: fallback.id,
            orderIndex: orderIndex++,
            sets: exerciseInput.sets ?? 3,
            repsMin: exerciseInput.repsMin ?? null,
            repsMax: exerciseInput.repsMax ?? null,
            restSec: exerciseInput.restSec ?? null,
            notes: exerciseInput.notes ?? null,
          },
        });
      }
    } else {
      const alreadyAdded = savedExercises.some((s) => s.exerciseId === found.id);
      savedExercises.push({ name: exerciseInput.name, found: true, exerciseId: found.id });

      if (!alreadyAdded) {
        await prisma.workoutPlanExercise.create({
          data: {
            workoutPlanId: plan.id,
            exerciseId: found.id,
            orderIndex: orderIndex++,
            sets: exerciseInput.sets ?? 3,
            repsMin: exerciseInput.repsMin ?? null,
            repsMax: exerciseInput.repsMax ?? null,
            restSec: exerciseInput.restSec ?? null,
            notes: exerciseInput.notes ?? null,
          },
        });
      }
    }
  }

  return { planId: plan.id, planName: plan.name, savedExercises };
}

// ─── AI History (independente de WorkoutPlan) ───────────────────────────
//
// Persiste o snapshot completo do plano gerado pela IA SEMPRE, sem precisar
// que o user clique "Salvar". Permite browsing posterior em "Ver treinos
// gerados" mesmo se /workouts estiver vazio. Quando o user quiser usar
// um treino antigo, useAIHistoryPlan clona o snapshot pra um WorkoutPlan
// novo (mantendo o histórico intacto).

const MAX_HISTORY_PER_USER = 20;

export async function saveAIGenerationHistory(
  userId: string,
  body: SaveAIHistoryBody
): Promise<{ saved: number }> {
  // Bulk create — 1 row por dia da geração. Mesmo generationId em todos,
  // pra o list endpoint agrupar.
  await prisma.aIGeneratedPlan.createMany({
    data: body.days.map((d) => ({
      userId,
      generationId: body.generationId,
      generationLabel: body.generationLabel,
      dayLabel: d.dayLabel,
      dayIndex: d.dayIndex,
      planName: d.planName,
      planSnapshot: {
        planName: d.planName,
        exercises: d.exercises
      } as unknown as Prisma.InputJsonValue
    }))
  });

  // Prune: mantém só as últimas MAX_HISTORY_PER_USER gerações por user.
  // Identifica as gerações mais antigas via min(generatedAt) por
  // generationId e apaga TODAS as rows dessas gerações.
  await pruneOldAIHistory(userId);

  return { saved: body.days.length };
}

async function pruneOldAIHistory(userId: string): Promise<void> {
  // Lista todas as gerações do user com min(generatedAt) (representa
  // quando a geração foi criada). groupBy retorna gerações distintas.
  const generations = await prisma.aIGeneratedPlan.groupBy({
    by: ["generationId"],
    where: { userId },
    _min: { generatedAt: true }
  });
  if (generations.length <= MAX_HISTORY_PER_USER) return;

  // Ordena por mais antigo primeiro e apaga as gerações em excesso.
  generations.sort((a, b) => {
    const aMs = a._min.generatedAt?.getTime() ?? 0;
    const bMs = b._min.generatedAt?.getTime() ?? 0;
    return aMs - bMs;
  });
  const toDelete = generations
    .slice(0, generations.length - MAX_HISTORY_PER_USER)
    .map((g) => g.generationId);
  if (toDelete.length === 0) return;

  await prisma.aIGeneratedPlan.deleteMany({
    where: { userId, generationId: { in: toDelete } }
  });
}

// Preview do exercício no histórico — extraído do planSnapshot e devolvido
// no listAIHistory pra UI poder mostrar o conteúdo do treino antes de
// clonar pra /workouts. Campos opcionais porque a IA pode omitir sets/reps
// quando o user escolheu "IA decide".
export type AIHistoryExercisePreview = {
  name: string;
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  restSec?: number;
  notes?: string;
  muscleGroup?: string;
};

export type AIHistoryGeneration = {
  generationId: string;
  generationLabel: string;
  generatedAt: string;
  plans: Array<{
    id: string;
    dayLabel: string;
    dayIndex: number;
    planName: string;
    exerciseCount: number;
    // Exercícios extraídos do planSnapshot pra preview no front. Sem
    // round-trip extra — o snapshot já tá em memória aqui. Volume real:
    // ~20 exercícios × 140 rows = ~2800 itens no pior caso, ainda
    // dentro de ~50KB JSON.
    exercises: AIHistoryExercisePreview[];
  }>;
};

export async function listAIHistory(
  userId: string,
  limit: number
): Promise<AIHistoryGeneration[]> {
  // Pega todas as rows do user, ordenadas por mais recente. Agrupa em
  // memória pelo generationId. Volume é pequeno (cap 20 gerações × até
  // 7 dias = 140 rows no máximo), agrupar em SQL não vale a complexidade.
  const rows = await prisma.aIGeneratedPlan.findMany({
    where: { userId },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      generationId: true,
      generationLabel: true,
      generatedAt: true,
      dayLabel: true,
      dayIndex: true,
      planName: true,
      planSnapshot: true
    }
  });

  type Bucket = {
    generationId: string;
    generationLabel: string;
    generatedAt: Date;
    plans: AIHistoryGeneration["plans"];
  };
  const byGen = new Map<string, Bucket>();
  for (const r of rows) {
    let bucket = byGen.get(r.generationId);
    if (!bucket) {
      bucket = {
        generationId: r.generationId,
        generationLabel: r.generationLabel,
        generatedAt: r.generatedAt,
        plans: []
      };
      byGen.set(r.generationId, bucket);
    }
    // generatedAt do bucket = mais antigo entre os dias (quando a geração
    // efetivamente começou).
    if (r.generatedAt < bucket.generatedAt) bucket.generatedAt = r.generatedAt;
    // Extrai exercícios do snapshot pra preview no front (sem round-trip
    // extra). Tipa defensivamente — JSONB do Postgres pode vir em formato
    // inesperado se uma versão antiga gravou diferente.
    const snapshot = r.planSnapshot as { exercises?: Array<Record<string, unknown>> } | null;
    const exercises: AIHistoryExercisePreview[] = Array.isArray(snapshot?.exercises)
      ? snapshot.exercises.map((ex) => ({
          name: typeof ex.name === "string" ? ex.name : "",
          sets: typeof ex.sets === "number" ? ex.sets : undefined,
          repsMin: typeof ex.repsMin === "number" ? ex.repsMin : undefined,
          repsMax: typeof ex.repsMax === "number" ? ex.repsMax : undefined,
          restSec: typeof ex.restSec === "number" ? ex.restSec : undefined,
          notes: typeof ex.notes === "string" ? ex.notes : undefined,
          muscleGroup: typeof ex.muscleGroup === "string" ? ex.muscleGroup : undefined
        }))
      : [];
    bucket.plans.push({
      id: r.id,
      dayLabel: r.dayLabel,
      dayIndex: r.dayIndex,
      planName: r.planName,
      exerciseCount: exercises.length,
      exercises
    });
  }

  // Ordena planos dentro de cada bucket por dayIndex pra exibir em
  // ordem natural (Dia 1, Dia 2, Dia 3).
  for (const bucket of byGen.values()) {
    bucket.plans.sort((a, b) => a.dayIndex - b.dayIndex);
  }

  // Ordena gerações pelas mais recentes primeiro.
  const generations = Array.from(byGen.values());
  generations.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());

  return generations.slice(0, limit).map((b) => ({
    generationId: b.generationId,
    generationLabel: b.generationLabel,
    generatedAt: b.generatedAt.toISOString(),
    plans: b.plans
  }));
}

// "Usar este treino" — clona o snapshot da AIGeneratedPlan pra um
// WorkoutPlan novo (mantém histórico intacto). Tenta resolver os
// nomes dos exercícios no catálogo pra criar WorkoutPlanExercise com
// FK válido; nomes que não casam no catálogo são pulados (registrados
// no campo `notFoundExercises` do retorno).
export async function useAIHistoryPlan(
  userId: string,
  historyPlanId: string
): Promise<{ planId: string; planName: string; notFoundExercises: string[] }> {
  const row = await prisma.aIGeneratedPlan.findUnique({
    where: { id: historyPlanId },
    select: {
      userId: true,
      planName: true,
      planSnapshot: true
    }
  });

  if (!row || row.userId !== userId) {
    throw new AppError("Plano não encontrado", {
      statusCode: 404,
      code: "AI_HISTORY_PLAN_NOT_FOUND"
    });
  }

  const snapshot = row.planSnapshot as {
    planName?: string;
    exercises?: Array<{
      name: string;
      sets?: number;
      repsMin?: number;
      repsMax?: number;
      restSec?: number;
      notes?: string;
    }>;
  } | null;
  const exercises = Array.isArray(snapshot?.exercises) ? snapshot.exercises : [];

  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: row.planName,
      description: "Gerado por IA",
      status: "ACTIVE"
    }
  });

  const notFound: string[] = [];
  let orderIndex = 1;

  for (const ex of exercises) {
    // Mesma estratégia do saveAIWorkout: busca exata, depois contém.
    const found =
      (await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { equals: ex.name, mode: "insensitive" }
        },
        select: { id: true }
      })) ??
      (await prisma.exercise.findFirst({
        where: {
          isActive: true,
          OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
          name: { contains: ex.name, mode: "insensitive" }
        },
        select: { id: true }
      }));

    if (!found) {
      notFound.push(ex.name);
      continue;
    }

    await prisma.workoutPlanExercise.create({
      data: {
        workoutPlanId: plan.id,
        exerciseId: found.id,
        orderIndex: orderIndex++,
        sets: ex.sets ?? 3,
        repsMin: ex.repsMin ?? null,
        repsMax: ex.repsMax ?? null,
        restSec: ex.restSec ?? null,
        notes: ex.notes ?? null
      }
    });
  }

  return { planId: plan.id, planName: plan.name, notFoundExercises: notFound };
}
