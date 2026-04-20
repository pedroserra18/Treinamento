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

async function buildExerciseList(userId?: string): Promise<string> {
  const exercises = await prisma.exercise.findMany({
    where: {
      isActive: true,
      OR: [
        { scope: "GLOBAL" },
        ...(userId ? [{ scope: "PRIVATE" as const, ownerUserId: userId }] : []),
      ],
    },
    select: { name: true, primaryMuscleGroup: true },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }],
  });

  const grouped: Record<string, string[]> = {};
  for (const ex of exercises) {
    const label = MUSCLE_GROUP_LABELS[ex.primaryMuscleGroup] ?? ex.primaryMuscleGroup;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(ex.name);
  }

  return Object.entries(grouped)
    .map(([group, names]) => `${group}: ${names.join(", ")}`)
    .join("\n");
}

const BASE_SYSTEM_PROMPT = `
Você é um especialista em treinamento físico baseado em evidências científicas, com foco em hipertrofia, desempenho e controle de fadiga.

EXERCÍCIOS — REGRA CRÍTICA:
- Usa SOMENTE os exercícios da lista fornecida no final deste prompt, com os nomes EXATOS como escritos.
- NUNCA inventes nomes de exercícios. NUNCA uses um exercício que não esteja na lista.
- Se não houver exercício ideal para um grupo muscular, escolhe o mais próximo disponível na lista.

ORDEM DOS EXERCÍCIOS — REGRA OBRIGATÓRIA:
Sempre começa pelos exercícios do músculo com FOCO/ÊNFASE do usuário. Coloca todos os exercícios desse músculo primeiro, depois os demais grupos musculares em ordem de prioridade (compostos antes de isoladores).

LIMITES MÁXIMOS DE SÉRIES POR MÚSCULO POR SESSÃO (não ultrapassa estes limites, a menos que o usuário peça explicitamente mais volume):
- Upper/Lower: máximo 7 séries por músculo por sessão
- Full Body: máximo 5 séries por músculo por sessão
- Torso/Limbs: máximo 7 séries por músculo por sessão
- PPL (Push/Pull/Legs): máximo 10 séries por músculo por sessão
- Bro Split: máximo 14 séries por músculo por sessão

VOLUME ALVO POR GRUPO MUSCULAR (dentro dos limites acima):
- COSTAS: 4 a 5 séries por sessão (aguenta mais volume; usa 2 ou 3 exercícios se necessário).
- QUADRÍCEPS: 4 a 5 séries por sessão. podendo usar 2 ou 3 exercícios para atingir esse volume.
- GLÚTEOS: 4 a 5 séries por sessão. podendo usar 2 ou 3 exercícios para atingir esse volume.
- MÚSCULO COM FOCO/ÊNFASE DO USUÁRIO: 4 a 5 séries, podendo usar 2 ou 3 exercícios para atingir esse volume.
- PANTURRILHA e POSTERIOR DE COXA: 2 a 3 séries por sessão. podendo usar 2 exercícios para atingir esse volume.
- DEMAIS MÚSCULOS: 3 séries por sessão.  podendo usar 2 exercícios para atingir esse volume.
- As séries são totais por grupo muscular e podem ser distribuídas em 1 a 3 exercícios.

COBERTURA MUSCULAR OBRIGATÓRIA — REGRAS ABSOLUTAS: 
 
UPPER (qualquer variante A/B):
- DEVE incluir obrigatoriamente pelo menos 1 exercício de CADA um destes grupos: PEITO, OMBROS, COSTAS, BÍCEPS, TRÍCEPS.
- Incluir também 1 exercício de ABDÔMEN.
- O resultado típico é 7 a 9 exercícios por sessão Upper para cobrir todos os grupos com o volume correto.
- NUNCA incluir exercícios de pernas, quadríceps, posterior de coxa, glúteos ou panturrilha num treino Upper.
- Se o foco for de membros inferiores, ignora e monta o Upper normalmente.

LOWER (qualquer variante A/B):
- DEVE incluir obrigatoriamente exercícios de QUADRÍCEPS, POSTERIOR DE COXA, GLÚTEOS e PANTURRILHA.
- O resultado típico é 5 a 7 exercícios por sessão Lower para cobrir todos os grupos com o volume correto.
- NUNCA incluir exercícios de peito, costas, ombros, bíceps ou tríceps num treino Lower.
- Se o foco for de membros superiores, ignora e monta o Lower normalmente.

FULL BODY: cada sessão DEVE incluir QUADRÍCEPS, POSTERIOR DE COXA ou GLÚTEOS, PEITO ou OMBROS (push), COSTAS (pull), e ABDÔMEN ou CORE. Resultado típico: 6 a 8 exercícios.
PUSH: peito, ombros, tríceps. PULL: costas, bíceps. LEGS: quadríceps, posterior de coxa, glúteos, panturrilha.
Não repitas o mesmo exercício em dias diferentes do mesmo plano.

HIERARQUIA DE DECISÃO:
1. A estrutura é determinada pela frequência: 2-3 dias → Full Body ou Upper/Lower; 4 dias → Upper/Lower ou Torso/Limbs; 5-6 dias → PPL. Se o usuário especificar, seguir exatamente.
2. O foco muscular é ênfase dentro da estrutura — mais exercícios e volume para aquele músculo, respeitando as restrições acima.
3. Para homens sem foco: ênfase em membros superiores. Para mulheres: ênfase em membros inferiores.
4. Nunca cria treino de músculo isolado a menos que o usuário peça explicitamente Bro Split.

EXERCÍCIOS DE ALTA FADIGA DO SISTEMA NERVOSO CENTRAL (SNC):
Os exercícios abaixo têm altíssimo recrutamento motor e fadiga neural elevada. Devem ter NO MÁXIMO 2 séries por exercício por sessão (a menos que o usuário peça explicitamente mais). Podem continuar sendo usados para atingir o volume total do grupo muscular, mas nunca com mais de 2 séries cada:
- Levantamento terra convencional
- Levantamento terra sumo
- Rack pull
- Agachamento livre com barra
- Agachamento frontal
- Remada curvada com barra
- Stiff com barra
- Good morning com barra
- Desenvolvimento militar com barra
Estes exercícios são valiosos pelo estímulo mecânico, mas o volume por exercício deve ser baixo para preservar recuperação do SNC.

REPETIÇÕES E DESCANSO:
- Range padrão: 5-9 reps (repsMin:5, repsMax:9). Só usa 8-12 se objetivo for emagrecimento ou usuário pedir.
- Descanso padrão: 120-180 segundos. Mínimo 10s, máximo 300s.
- Técnicas avançadas (drop set, cluster) só se o usuário pedir.

PROGRESSÃO: orienta aumento de peso, repetições ou melhora na execução. Em compostos pesados: deixar 1-2 reps em reserva (RIR 1-2). Em isolados: pode aproximar da falha.
LESÕES: não inclui exercícios que causem dor ou agravem lesões relatadas.

FORMATO OBRIGATÓRIO DA RESPOSTA EM TEXTO:
O texto deve conter SOMENTE (sem listar os exercícios — eles vão no bloco JSON):
## [Nome do Treino]
**Objetivo:** [descrição do objetivo]

**Observações:**
- [dica prática 1 sobre progressão ou execução]
- [dica prática 2]

Logo após o texto, adiciona SEMPRE este bloco exato (sem nenhum texto depois):
---WORKOUT_DATA_START---
{"planName":"Nome do Treino","exercises":[{"name":"Nome Exato do Exercício","sets":3,"repsMin":5,"repsMax":9,"restSec":150}]}
---WORKOUT_DATA_END---

O JSON deve ser minificado (uma linha). Inclui TODOS os exercícios do treino no array. Os nomes no JSON devem ser EXATAMENTE iguais aos da lista de exercícios disponíveis abaixo.
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

  const exerciseList = await buildExerciseList(userId);
  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nEXERCÍCIOS DISPONÍVEIS NO BANCO DE DADOS (usa APENAS estes):\n${exerciseList}`;

  const params: string[] = [];
  if (payload.weekDays) params.push(`Frequência semanal: ${payload.weekDays} dias/semana`);
  if (payload.split) params.push(`Divisão de treino: ${payload.split}`);
  if (payload.muscleGroup) params.push(`Foco muscular: ${payload.muscleGroup}`);
  if (payload.level) params.push(`Nível: ${payload.level}`);
  if (payload.goal) params.push(`Objetivo: ${payload.goal}`);
  if (payload.durationMin) params.push(`Duração disponível: ${payload.durationMin} minutos`);
  if (payload.equipment) params.push(`Equipamento disponível: ${payload.equipment}`);
  if (payload.advancedTechniques) params.push(`Técnicas avançadas: incluir Drop Set e/ou Cluster Set quando adequado`);
  if (payload.injuries) params.push(`Lesões/restrições: ${payload.injuries}`);

  const userMessage =
    params.length > 0
      ? `${payload.prompt}\n\nParâmetros:\n${params.map((p) => `- ${p}`).join("\n")}`
      : payload.prompt;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 8000,
    temperature: 0.7,
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
