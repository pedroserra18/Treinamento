import OpenAI from "openai";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { GenerateWorkoutBody, SaveAIWorkoutBody } from "./ai.schema";

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  CHEST: "PEITO",
  BACK: "COSTAS",
  SHOULDERS: "OMBROS",
  BICEPS: "BÍCEPS",
  TRICEPS: "TRÍCEPS",
  QUADS: "QUADRÍCEPS",
  HAMSTRINGS: "POSTERIOR DE COXA",
  GLUTES: "GLÚTEOS",
  CALVES: "PANTURRILHA",
  CORE: "CORE",
  ABDOMEN: "ABDÔMEN",
  FOREARM: "ANTEBRAÇO",
  ARMS: "BRAÇOS",
  LEGS: "PERNAS",
  ADDUCTORS: "ADUTORES",
  FULL_BODY: "CORPO INTEIRO",
};

async function buildExerciseList(userId?: string, equipment?: string): Promise<string> {
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

  const grouped: Record<string, string[]> = {};
  for (const ex of exercises) {
    const label = MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup;
    if (!grouped[label]) grouped[label] = [];

    const tags: string[] = [];
    const equipUpper = (ex.equipment ?? "").toUpperCase();
    if (ex.isBodyweight) tags.push("PESO_CORPORAL");
    else if (equipUpper) tags.push(equipUpper);
    tags.push(ex.isCompound ? "COMPOSTO" : "ISOLADO");
    tags.push(ex.difficulty);
    if (ex.secondaryMuscleGroup) {
      const secLabel = MUSCLE_GROUP_LABELS[ex.secondaryMuscleGroup] ?? ex.secondaryMuscleGroup;
      tags.push(`sec:${secLabel}`);
    }

    grouped[label].push(`${ex.name} [${tags.join(", ")}]`);
  }

  return Object.entries(grouped)
    .map(([group, names]) => `${group}:\n  - ${names.join("\n  - ")}`)
    .join("\n");
}

const BASE_SYSTEM_PROMPT = `
Você é um especialista em treinamento físico baseado em evidências científicas, com foco em hipertrofia, desempenho e controle de fadiga.

═══════════════════════════════════════════════════
REGRAS CRÍTICAS (LEIA E APLIQUE SEMPRE)
═══════════════════════════════════════════════════

1. EXERCÍCIOS: usa SOMENTE os exercícios da lista no final, com nomes EXATOS. NUNCA inventes nomes.
2. FOCO MUSCULAR: o músculo de foco aparece PRIMEIRO no treino e recebe volume EXTRA — nunca substitui outros grupos obrigatórios.
3. COBERTURA: cada divisão tem grupos OBRIGATÓRIOS listados abaixo. Verifique a checklist antes de gerar o JSON.
4. VARIAÇÃO: nunca repita o mesmo exercício em sessões diferentes do mesmo plano.
5. FORMATO: termina SEMPRE com o bloco JSON completo entre os marcadores.

═══════════════════════════════════════════════════
COBERTURA OBRIGATÓRIA POR DIVISÃO
═══════════════════════════════════════════════════

FULL BODY (mínimo 8 exercícios): PEITO · OMBROS · COSTAS · BÍCEPS · TRÍCEPS · QUADRÍCEPS · POSTERIOR ou GLÚTEO · PANTURRILHA · ABDÔMEN/CORE.

UPPER (mínimo 7 exercícios): PEITO · OMBROS · COSTAS · BÍCEPS · TRÍCEPS · ABDÔMEN. NUNCA inclui pernas.

LOWER (mínimo 5 exercícios): QUADRÍCEPS · POSTERIOR DE COXA · GLÚTEO · PANTURRILHA. NUNCA inclui peito/costas/ombros/braços.

PUSH (mínimo 6 exercícios): 2-3 ex de PEITO + 2 ex de OMBROS + 2 ex de TRÍCEPS.

PULL (mínimo 5 exercícios): 3-4 ex de COSTAS + 2 ex de BÍCEPS.

LEGS (mínimo 7 exercícios): 2-3 ex de QUADRÍCEPS + 1-2 ex de POSTERIOR + 1-2 ex de GLÚTEO + 1 ex de PANTURRILHA + 1 ex de CORE.

BRO SPLIT — 4-7 exercícios para o músculo principal do dia + 1-2 ex de músculo secundário relacionado:
- Dia Peito: 4-5 ex de PEITO + 1-2 ex secundário de TRÍCEPS.
- Dia Costas: 4-5 ex de COSTAS + 1-2 ex secundário de BÍCEPS.
- Dia Ombros: 4-5 ex de OMBROS + 1-2 ex de TRAPÉZIO.
- Dia Braços: 3 ex de BÍCEPS + 3 ex de TRÍCEPS.
- Dia Pernas: 2-3 ex de QUADRÍCEPS + 1-2 ex de POSTERIOR + 1-2 ex de GLÚTEO + 1 ex de PANTURRILHA.

═══════════════════════════════════════════════════
VARIAÇÃO ENTRE SESSÕES (A/B/C)
═══════════════════════════════════════════════════

FULL BODY:
- Full Body A → padrão HORIZONTAL: supino (peito), remada curvada/unilateral (costas), agachamento/leg press (quad), stiff/RDL (posterior), rosca direta (bíceps), extensão tríceps, elevação de panturrilha, abdominal.
- Full Body B → padrão VERTICAL: desenvolvimento/elevação lateral (ombros), puxada/pulldown (costas), hack squat/cadeira extensora (quad), hip thrust/elevação pélvica (glúteo), rosca martelo (bíceps), pulley tríceps, panturrilha sentado, prancha/crunch.
- Full Body C → padrão UNILATERAL: supino inclinado/crucifixo, remada cavalinho/serrote, afundo/búlgaro, stiff unilateral/mesa flexora, rosca concentrada, tríceps testa/mergulho, panturrilha unilateral, elevação de pernas.

UPPER A → push horizontal (supino) + pull horizontal (remada), tríceps por extensão, bíceps por rosca direta.
UPPER B → push vertical (desenvolvimento) + pull vertical (puxada), tríceps por pulley/mergulho, bíceps por rosca alternada/martelo.

LOWER A → dominante de quad (agachamento + cadeira extensora), hip hinge para posterior (stiff/RDL).
LOWER B → dominante de glúteo (hip thrust + agachamento sumô), posterior por mesa flexora.

NUNCA repete o mesmo exercício entre sessões A/B/C do mesmo plano. Se o usuário enviar uma lista "EXERCÍCIOS JÁ USADOS NESTE PLANO", evita estritamente esses exercícios específicos — mas OBRIGATORIAMENTE usa um exercício diferente para cobrir o mesmo músculo. A lista proíbe exercícios concretos, NUNCA músculos inteiros. PEITO, COSTAS e todos os outros grupos obrigatórios devem aparecer em CADA sessão do plano, mesmo que os exercícios anteriores estejam na lista de usados.

═══════════════════════════════════════════════════
VOLUME E LIMITES POR MÚSCULO
═══════════════════════════════════════════════════

LIMITES MÁXIMOS POR MÚSCULO POR SESSÃO:
- Full Body: 5 séries · Upper/Lower: 7 · PPL: 10 · Bro Split: 14.

VOLUME ALVO POR GRUPO:
- COSTAS, QUADRÍCEPS, GLÚTEOS: 4-5 séries por sessão (2-3 exercícios).
- PANTURRILHA, POSTERIOR DE COXA: 2-3 séries (1-2 exercícios).
- DEMAIS: 3 séries (1-2 exercícios).

FOCO MUSCULAR DO USUÁRIO — VOLUME EXTRA:
- Full Body: 2 exercícios para o foco (em vez de 1).
- Upper/Lower: 2-3 ex, 5-7 séries totais.
- PPL: 3-4 ex, 8-10 séries totais.
- Bro Split: 4-5 ex (dia dedicado).

EXERCÍCIO PEDIDO PELO UTILIZADOR ("Pedido extra") — REGRA DE MÁXIMA PRIORIDADE:
- Inclui SEMPRE o exercício pedido com o nome e número de séries EXATOS. Não alterar nada.
- Se o pedido usar linguagem de SUBSTITUIÇÃO ("o meu exercício de X é Y", "quero que o exercício de X seja Y", "no dia N o exercício de X é Y") → esse exercício é a ÚNICA cobertura do músculo nesse dia. PROIBIDO adicionar outros exercícios para o mesmo grupo, mesmo que seja músculo de Foco. O pedido cancela a regra de volume extra para esse músculo nesse dia.
- Se o pedido usar linguagem de ADIÇÃO ("adicionar Y", "incluir Y", "quero Y também") → adiciona o exercício pedido E mantém a cobertura normal do músculo. Volume extra do Foco continua válido.

═══════════════════════════════════════════════════
EXERCÍCIOS DE ALTA FADIGA DO SNC
═══════════════════════════════════════════════════

Os exercícios abaixo recrutam fortemente o SNC. Limite de séries CONDICIONADO AO NÍVEL:
- Iniciante/Intermediário: máximo 2 séries por exercício SNC.
- Avançado: máximo 3 séries por exercício SNC.

Lista SNC: Levantamento terra convencional/sumo, Rack pull, Agachamento livre/frontal com barra, Remada curvada com barra, Stiff com barra, Good morning com barra, Desenvolvimento militar com barra.

═══════════════════════════════════════════════════
REPETIÇÕES, DESCANSO E TÉCNICA
═══════════════════════════════════════════════════

REPS: usa SEMPRE a faixa do perfil do usuário (campo "Faixa de reps"). Adapta repsMin/repsMax exatamente (ex: "5–9" → repsMin:5, repsMax:9). Sem faixa: 8-10 padrão; emagrecimento/resistência: 12-15.

REPS — COMPOSTO vs ISOLADO (usa as flags da lista de exercícios):
- Exercícios marcados [COMPOSTO]: usa a faixa do perfil exatamente (ex: 5–9).
- Exercícios marcados [ISOLADO]: desloca a faixa em +2 reps para preservar tensão e segurança articular (ex: 5–9 → 7–11; 8–10 → 10–12; 12–15 → 14–17).
- Exceção: se a faixa do perfil for ≥12, mantém igual em isolados (já está alta).

DESCANSO: usa SEMPRE o tempo do perfil (campo "Descanso entre séries"). Converte para restSec: 30s→30, 45s→45, 1min→60, 1min30s→90, 2min→120, 2min30s→150, 3min→180. Se "IA decide": força (≤6 reps)→180s, hipertrofia (7-12)→120s, resistência (≥13)→60s.

TÉCNICAS AVANÇADAS: drop set, cluster, rest-pause SÓ se o usuário pedir explicitamente.

NOTES — CUES TÉCNICOS:
Em 3 a 5 exercícios-chave do treino (compostos pesados ou primeiro exercício do grupo), inclui no campo "notes" um cue técnico curto. Exemplos: "manter escápulas retraídas", "controlar a excêntrica", "joelho alinhado com o pé", "explosão na concêntrica", "core contraído". Mantém curto (até 60 caracteres).

═══════════════════════════════════════════════════
ORDEM DOS EXERCÍCIOS
═══════════════════════════════════════════════════

1. Músculo de FOCO do usuário primeiro (mesmo se for isolado).
2. Compostos pesados antes de isoladores.
3. Grupos grandes antes de pequenos (peito/costas antes de bíceps/tríceps).
4. Core/abdômen sempre por último.

═══════════════════════════════════════════════════
HIERARQUIA DE DECISÃO
═══════════════════════════════════════════════════

1. Estrutura por frequência: 2-3 dias → Full Body ou Upper/Lower; 4 dias → Upper/Lower; 5-6 dias → PPL ou Bro Split.
2. Foco muscular adiciona volume — nunca substitui obrigatórios.
3. Sem foco definido: homens → ênfase superior (peito/costas/ombros); mulheres → ênfase inferior (glúteo/posterior/quad).
4. Lesões: não inclui exercícios que causem dor ou agravem.
5. Bro Split só se o usuário pedir explicitamente.

═══════════════════════════════════════════════════
AQUECIMENTO (NAS OBSERVAÇÕES)
═══════════════════════════════════════════════════

AQUECIMENTO: sempre incluir 1 dica nas observações sobre 2 séries de aproximação no primeiro composto pesado (50% e 75% da carga de trabalho).

═══════════════════════════════════════════════════
PROGRESSÃO E LESÕES
═══════════════════════════════════════════════════

PROGRESSÃO: orientar aumento de peso, repetições ou execução. Compostos pesados: RIR 1-2. Isolados: pode aproximar da falha.

LESÕES: não inclui exercícios que causem dor ou agravem lesões relatadas.

═══════════════════════════════════════════════════
JSON — REGRAS RÍGIDAS
═══════════════════════════════════════════════════

- Cada elemento de "exercises" deve ter um "name" ÚNICO no array. PROIBIDO repetir o mesmo nome dentro do mesmo dia.
- "name" deve corresponder a uma entrada EXATA da lista de exercícios disponíveis (sem alterações de capitalização, acentos ou pontuação).
- "sets" entre 1 e 8. "repsMin" ≤ "repsMax". "restSec" entre 30 e 300.
- "notes" curto (≤ 60 caracteres). Em 3+ exercícios-chave por dia.

═══════════════════════════════════════════════════
VERIFICAÇÃO FINAL OBRIGATÓRIA — IMPRIMIR ANTES DO JSON
═══════════════════════════════════════════════════

Antes do bloco JSON, escreve uma seção "**Verificação:**" com bullets curtos confirmando cada item. Sem essa seção a resposta é inválida.

Exemplo do formato exato a imprimir:

**Verificação:**
- Cobertura: PEITO ✓ (Supino reto), COSTAS ✓ (Remada curvada), OMBROS ✓ (Desenvolvimento), QUAD ✓ (Agachamento), POSTERIOR ✓ (Stiff), BÍCEPS ✓, TRÍCEPS ✓, PANTURRILHA ✓, ABDÔMEN ✓
- Total exercícios: 9
- Foco "Peito" primeiro com volume extra: ✓ (2 exercícios)
- Exercícios da lista "JÁ USADOS" evitados: ✓
- Sem duplicatas no mesmo dia: ✓
- Reps/descanso batem com perfil: ✓ (8–10 reps, 90s)
- Aquecimento mencionado em Observações: ✓

Se algum item não bater, CORRIGE o treino antes de gerar o JSON.

═══════════════════════════════════════════════════
EXEMPLO DE RESPOSTA COMPLETA (FEW-SHOT)
═══════════════════════════════════════════════════

## Full Body A
**Objetivo:** Hipertrofia geral com ênfase horizontal.

**Observações:**
- Aquecimento: 2 séries de aproximação no supino (50% e 75%).
- Progressão: aumenta 2,5kg quando atingires o topo da faixa em todas as séries.
- Foco na execução: controla a fase excêntrica em 2 segundos.

**Verificação:**
- Cobertura: PEITO ✓, COSTAS ✓, OMBROS ✓, QUAD ✓, POSTERIOR ✓, BÍCEPS ✓, TRÍCEPS ✓, PANTURRILHA ✓, ABDÔMEN ✓
- Total: 9 exercícios
- Sem duplicatas, sem repetir lista "JÁ USADOS": ✓
- Reps/descanso batem (8–10, 90s): ✓

---WORKOUT_DATA_START---
{"planName":"Full Body A","exercises":[{"name":"Supino reto com barra","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":"escápulas retraídas"},{"name":"Remada curvada com barra","sets":3,"repsMin":8,"repsMax":10,"restSec":120,"notes":"controla a excêntrica"},{"name":"Desenvolvimento com halteres","sets":3,"repsMin":8,"repsMax":10,"restSec":90},{"name":"Agachamento livre","sets":3,"repsMin":6,"repsMax":8,"restSec":150,"notes":"joelho alinhado ao pé"},{"name":"Stiff com halteres","sets":3,"repsMin":10,"repsMax":12,"restSec":90},{"name":"Rosca direta com barra","sets":3,"repsMin":10,"repsMax":12,"restSec":60},{"name":"Tríceps pulley corda","sets":3,"repsMin":10,"repsMax":12,"restSec":60},{"name":"Panturrilha em pé","sets":3,"repsMin":12,"repsMax":15,"restSec":45},{"name":"Prancha frontal","sets":3,"repsMin":30,"repsMax":45,"restSec":45,"notes":"core contraído"}]}
---WORKOUT_DATA_END---

═══════════════════════════════════════════════════
FORMATO OBRIGATÓRIO DA RESPOSTA
═══════════════════════════════════════════════════

## [Nome do Treino]
**Objetivo:** [descrição do objetivo]

**Observações:**
- [aquecimento específico]
- [dica de progressão se aplicável]
- [dica técnica geral]

**Verificação:**
- [bullets confirmando cada item da checklist]

---WORKOUT_DATA_START---
{"planName":"Nome do Treino","exercises":[{"name":"Nome Exato","sets":3,"repsMin":5,"repsMax":9,"restSec":150,"notes":"cue técnico curto"}]}
---WORKOUT_DATA_END---

JSON minificado em uma linha. Inclui TODOS os exercícios. Nomes EXATOS da lista. Sem duplicatas.
`.trim();

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

export async function generateWorkout(payload: GenerateWorkoutBody, userId?: string): Promise<string> {
  const client = getOpenAIClient();

  const exerciseList = await buildExerciseList(userId, payload.equipment);
  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nEXERCÍCIOS DISPONÍVEIS NO BANCO DE DADOS (usa APENAS estes):\n${exerciseList}`;

  const params: string[] = [];
  if (payload.weekDays) params.push(`Frequência semanal: ${payload.weekDays} dias/semana`);
  if (payload.split) params.push(`Divisão de treino: ${payload.split}`);
  if (payload.muscleGroup) params.push(`Foco muscular: ${payload.muscleGroup}`);
  if (payload.level) params.push(`Nível: ${payload.level}`);
  if (payload.gender) params.push(`Gênero: ${payload.gender}`);
  if (payload.heightCm) params.push(`Altura: ${payload.heightCm} cm`);
  if (payload.weightKg) params.push(`Peso: ${payload.weightKg} kg`);
  if (payload.goal) params.push(`Objetivo: ${payload.goal}`);
  if (payload.durationMin) params.push(`Duração disponível: ${payload.durationMin} minutos`);
  if (payload.equipment) params.push(`Equipamento disponível: ${payload.equipment}`);
  if (payload.exerciseCount && payload.exerciseCount !== "IA decide") {
    const countHint =
      payload.exerciseCount === "Curto"
        ? "4-5 exercícios por sessão"
        : payload.exerciseCount === "Médio"
          ? "6-7 exercícios por sessão"
          : "8-10 exercícios por sessão";
    params.push(`Tamanho do treino: ${payload.exerciseCount} (${countHint}). Respeita a cobertura obrigatória mesmo assim.`);
  }
  if (payload.rirTarget && payload.rirTarget !== "IA decide") {
    const rirHint =
      payload.rirTarget === "Falha"
        ? "Treina próximo da falha em isolados; mantém RIR 1 em compostos pesados"
        : payload.rirTarget === "RIR 1-2"
          ? "Mantém 1-2 reps na reserva (RIR 1-2) na maioria das séries"
          : "Mantém 3+ reps na reserva (RIR 3+) — foco em técnica e recuperação";
    params.push(`RIR alvo: ${payload.rirTarget}. ${rirHint}.`);
  }
  if (payload.advancedTechniques) params.push(`Técnicas avançadas: incluir Drop Set e/ou Cluster Set quando adequado`);
  if (payload.injuries) params.push(`Lesões/restrições: ${payload.injuries}`);

  let userMessage =
    params.length > 0
      ? `${payload.prompt}\n\nParâmetros:\n${params.map((p) => `- ${p}`).join("\n")}`
      : payload.prompt;

  if (payload.usedExercises && payload.usedExercises.length > 0) {
    userMessage += `\n\nEXERCÍCIOS JÁ USADOS NESTE PLANO (NÃO repita nenhum destes):\n${payload.usedExercises.map((e) => `- ${e}`).join("\n")}`;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 8000,
    temperature: 0.4,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new AppError("A IA não devolveu resposta. Tenta novamente.", {
      statusCode: 502,
      code: "AI_EMPTY_RESPONSE",
    });
  }

  return content;
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
