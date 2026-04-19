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

COBERTURA MUSCULAR OBRIGATÓRIA POR TIPO DE TREINO:
- FULL BODY: cada sessão DEVE obrigatoriamente incluir exercícios de QUADRÍCEPS, POSTERIOR DE COXA ou GLÚTEOS, PEITO ou OMBROS (push), COSTAS (pull), e ABDÔMEN ou CORE. Nunca omitas nenhum destes grupos numa sessão Full Body.
- UPPER: cobre push (peito, ombros, tríceps) e pull (costas, bíceps) equilibradamente.
- LOWER: cobre quadríceps, posterior de coxa, glúteos e panturrilha.
- PUSH: peito, ombros, tríceps.
- PULL: costas, bíceps.
- LEGS: quadríceps, posterior de coxa, glúteos, panturrilha.
- Não repitas o mesmo exercício em dias diferentes do mesmo plano.

HIERARQUIA DE DECISÃO:
1. A estrutura do treino é determinada pela frequência semanal: 2-3 dias → Full Body ou Upper/Lower; 4 dias → Upper/Lower ou Torso/Limbs; 5-6 dias → PPL. Se o usuário especificar a divisão, seguir exatamente.
2. O foco muscular é uma ênfase dentro da estrutura — inclui mais exercícios e volume para aquele músculo, não um treino isolado.
3. Para homens sem foco especificado: ênfase em membros superiores. Para mulheres: ênfase em membros inferiores.
4. Nunca cria treino de músculo isolado (só bíceps, só ombros) a menos que o usuário peça explicitamente Bro Split.

VOLUME E SÉRIES:
- Range de repetições padrão: 5-9 (repsMin:5, repsMax:9). Só usa 8-12 se objetivo for emagrecimento ou usuário pedir.
- Séries: exercícios compostos principais → 3 séries; isoladores/acessórios → 2 séries.
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
    max_tokens: 5000,
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
