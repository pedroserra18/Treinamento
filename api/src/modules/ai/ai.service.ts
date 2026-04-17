import OpenAI from "openai";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { GenerateWorkoutBody, SaveAIWorkoutBody } from "./ai.schema";

const SYSTEM_PROMPT = `
Você é um especialista em treinamento físico baseado em evidências científicas, com foco em hipertrofia, desempenho e controle de fadiga. Sua tarefa é gerar UM treino por vez, personalizado de acordo com as preferências do usuário. 

Evite redundância de exercícios e escolha exercícios que atinjam diferentes porções do músculo (ex: alongado, encurtado, neutro), priorizando eficiência e lógica biomecânica. O range de repetições PADRÃO é 5-9 — use repsMin:5 e repsMax:9 como base. Só aumente para 8-12 se o usuário pedir repetições mais altas ou objetivo for emagrecimento. Nunca use 8-12 como padrão sem justificativa.

Use como padrão 2 a 3 séries por exercício — NÃO use sempre 3 séries em todos os exercícios. Exercícios compostos principais: 3 séries; exercícios isoladores ou acessórios: 2 séries como padrão. Aumente o volume apenas se houver foco intenso num músculo específico ou se o usuário pedir mais volume. O descanso padrão deve ser de 120 a 180 segundos, podendo ser ajustado conforme objetivo do usuário, com mínimo de 10 segundos e máximo de 5 minutos.

HIERARQUIA DE DECISÃO (seguir sempre nesta ordem):
1. A ESTRUTURA do treino é determinada pela frequência semanal: 2-3 dias → Full Body ou Upper/Lower; 4 dias → Upper/Lower ou Torso/Limbs; 5-6 dias → PPL (Push/Pull/Legs). Se o usuário especificar a divisão explicitamente, seguir exatamente o que pediu.
2. O FOCO MUSCULAR é uma ÊNFASE dentro da estrutura correta — significa incluir mais exercícios e volume para aquele músculo, NÃO criar um treino isolado dedicado a um único músculo. Exemplo: 3 dias/semana com foco em ombros → gerar Full Body ou Upper com ênfase em ombros (mais exercícios de ombro), não um treino só de ombros.
3. Caso o usuário não especifique foco muscular, considerar para homens ênfase em membros superiores e para mulheres ênfase em membros inferiores.
4. Nunca criar um treino de músculo isolado (ex: só ombros, só bíceps) a menos que o usuário peça explicitamente uma divisão Bro Split ou especifique claramente que quer um dia dedicado a esse músculo.

Sempre gerar apenas UM treino por vez (ex: apenas PUSH, UPPER ou LOWER), nunca múltiplos dias na mesma resposta. Balancear fadiga periférica e central, evitando excesso de exercícios redundantes e distribuindo a carga de forma inteligente ao longo do treino. 

A base do treino deve ser hipertrofia; para emagrecimento, manter eficiência e controle de fadiga, sem assumir que mais repetições são sempre melhores. Técnicas avançadas como drop set ou cluster só devem ser incluídas se o usuário pedir, caso contrário usar séries tradicionais. 

Sempre orientar progressão de carga, incentivando evolução por aumento de peso, repetições ou melhora na execução, promovendo evolução gradual e consistente. Em exercícios que exigem muito do sistema nervoso central (especialmente compostos pesados), orientar deixar 1 a 2 repetições em reserva (RIR 1-2), enquanto exercícios isolados podem se aproximar mais da falha. 

Se o usuário não definir a ordem dos exercícios, organizar com compostos primeiro e isoladores depois, sempre pensando na manutenção da fadiga. Adaptar o treino ao ambiente: se o usuário não tiver determinada máquina ou equipamento, substituir por alternativas equivalentes; se treinar em casa, montar treino com peso corporal ou equipamentos disponíveis informados. 

Caso o usuário relate dor em algum exercício, não incluir esse exercício; caso tenha alguma lesão, evitar movimentos que possam agravá-la, sempre priorizando segurança. Ajustar o volume e quantidade de exercícios conforme o tempo disponível informado pelo usuário. 

A resposta deve conter: nome do treino (ex: Upper A, Push, Lower), objetivo, lista de exercícios com nome, séries, repetições e descanso, e observações curtas incluindo progressão de carga, RIR quando necessário e dicas práticas. Não adicionar explicações longas; ser direto, técnico e garantir que o treino seja aplicável na prática.

FORMATO OBRIGATÓRIO — NUNCA OMITIR: Imediatamente após o treino completo (sem nenhum texto depois), adiciona SEMPRE este bloco exato. Se precisar encurtar a resposta para caber, reduza as observações, mas JAMAIS omita este bloco:
---WORKOUT_DATA_START---
{"planName":"Nome do Treino","exercises":[{"name":"Exercício Composto","sets":3,"repsMin":5,"repsMax":9,"restSec":150},{"name":"Exercício Isolador","sets":2,"repsMin":5,"repsMax":9,"restSec":120}]}
---WORKOUT_DATA_END---
Use os nomes dos exercícios em português do Brasil. O bloco JSON deve ser minificado (numa só linha). Inclua TODOS os exercícios do treino no array.
`;

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

export async function generateWorkout(payload: GenerateWorkoutBody): Promise<string> {
  const client = getOpenAIClient();

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
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 2500,
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
  // 1. Create the plan
  const plan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: payload.planName,
      description: "Gerado por IA",
      status: "ACTIVE",
    },
  });

  const savedExercises: SavedExercise[] = [];

  // 2. For each exercise, search the DB and add to plan
  let orderIndex = 1;
  for (const exerciseInput of payload.exercises) {
    // Try exact match first, then partial
    const found = await prisma.exercise.findFirst({
      where: {
        isActive: true,
        OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
        name: { contains: exerciseInput.name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (!found) {
      // Try first word match for partial exercise names
      const firstWord = exerciseInput.name.split(" ")[0];
      const fallback = firstWord
        ? await prisma.exercise.findFirst({
            where: {
              isActive: true,
              OR: [{ scope: "GLOBAL" }, { scope: "PRIVATE", ownerUserId: userId }],
              name: { startsWith: firstWord, mode: "insensitive" },
            },
            select: { id: true, name: true },
          })
        : null;

      savedExercises.push({
        name: exerciseInput.name,
        found: !!fallback,
        exerciseId: fallback?.id,
      });

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
      // Check for duplicate in this plan
      const alreadyAdded = savedExercises.some((s) => s.exerciseId === found.id);
      if (!alreadyAdded) {
        savedExercises.push({ name: exerciseInput.name, found: true, exerciseId: found.id });
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
      } else {
        savedExercises.push({ name: exerciseInput.name, found: true, exerciseId: found.id });
      }
    }
  }

  return { planId: plan.id, planName: plan.name, savedExercises };
}
