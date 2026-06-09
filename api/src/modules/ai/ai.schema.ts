import { z } from "zod";

// Schema da requisição de geração de treino.
// V2 (post-quiz-audit Mai/2026): substitui campos legados muscleGroup
// (singular) e advancedTechniques (boolean) por musclesFocus[] e techniques[]
// para preservar a lista completa de respostas do usuário. Também adicionou
// age, phase, muscleFrequency, repRange, restTime, equipmentPreference e
// extraInfo — antes só viajavam dentro do texto livre do `prompt`, agora têm
// campos dedicados pra eliminar ambiguidade no <perfil_usuario>.
export const generateWorkoutBodySchema = z.object({
  prompt: z.string().trim().min(1, "Descreve o treino que pretendes").max(3000),

  // Identidade do dia que está sendo gerado (Push A / Lower B / Pernas...).
  // Backend usa pra escolher o validador per-day e o exemplo few-shot certo.
  dayLabel: z.string().trim().max(50).optional(),

  // Splits/labels do plano completo — informativos pra IA contextualizar.
  weekDays: z.enum(["2", "3", "4", "5", "6", ""]).optional(),
  split: z.string().trim().max(80).optional(),
  muscleFrequency: z.enum(["1x por semana", "2x por semana", "IA decide", ""]).optional(),

  // Perfil demográfico — afeta volume, intensidade e recuperação.
  level: z.enum(["Iniciante", "Intermediário", "Avançado", ""]).optional(),
  age: z.enum(["Menos de 18", "18–25", "26–35", "36–45", "46–55", "55+", ""]).optional(),
  gender: z.enum(["Masculino", "Feminino", ""]).optional(),
  heightCm: z.number().int().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(300).optional(),

  // Periodização e objetivo.
  phase: z.enum(["Ganho de massa", "Cutting (definição)", "Recomposição", "Manutenção", ""]).optional(),
  goal: z.enum(["Hipertrofia", "Força", "Resistência", "Emagrecimento", "Recuperação de lesão", ""]).optional(),

  // Local + preferência. `equipment` = qual local (academia/casa/sem-equip).
  // `equipmentPreference` = se em academia, prefere pesos livres ou máquinas.
  equipment: z.enum(["Academia (completa)", "Casa com equipamentos", "Sem equipamento", ""]).optional(),
  equipmentPreference: z.enum(["Pesos livres", "Máquinas", "Misto", ""]).optional(),

  // Estrutura da sessão.
  durationMin: z.enum(["30", "45", "60", "90", "120", ""]).optional(),
  exerciseCount: z.enum(["Curto", "Médio", "Longo", "IA decide", ""]).optional(),

  // Prescrição.
  repRange: z.enum(["4–6", "5–9", "6–8", "8–10", "10–12", "12–15", ""]).optional(),
  restTime: z.enum(["30s", "45s", "1min", "1min30s", "2min", "2min30s", "3min", "IA decide", ""]).optional(),
  rirTarget: z.enum(["Falha", "RIR 1-2", "RIR 3+", "IA decide", ""]).optional(),
  techniques: z
    .array(z.enum(["Drop Set", "Cluster Set", "Rest-Pause", "Bi-Set"]))
    .max(4)
    .optional(),

  // Foco e restrições — lista completa, não só o primeiro.
  musclesFocus: z
    .array(z.enum([
      "Ombro", "Peito", "Costas", "Bíceps", "Tríceps",
      "Quadríceps", "Posterior de Coxa", "Glúteo", "Panturrilha", "Core",
    ]))
    .max(3)
    .optional(),
  injuries: z.string().trim().max(200).optional(),

  // Variação entre dias do mesmo plano — nomes a evitar.
  usedExercises: z.array(z.string().trim().min(1).max(200)).max(80).optional(),

  // Pedido específico do usuário em texto livre. Backend tem regras para
  // interpretar "adicionar X" vs "substituir Y por X" no <pedido_extra> do prompt.
  extraInfo: z.string().trim().max(500).optional(),

  // Marca o primeiro dia de uma geração de plano nova (não regeneração de dia).
  // Usado apenas para registrar 1 evento de uso por plano gerado (métrica admin).
  isFirstDay: z.boolean().optional(),
});

// Interpreta uma divisão escrita em linguagem natural ("Outro" no quiz).
export const parseSplitBodySchema = z.object({
  description: z.string().trim().min(1, "Descreve a divisão").max(1000),
  daysPerWeek: z.coerce.number().int().min(1).max(7).optional(),
});

// Troca de exercício individual — sem IA, só query no banco.
export const swapExerciseBodySchema = z.object({
  muscleGroup: z.string().trim().min(1).max(40),
  equipment: z.enum(["Academia (completa)", "Casa com equipamentos", "Sem equipamento", ""]).optional(),
  exclude: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

export const saveAIWorkoutBodySchema = z.object({
  planName: z.string().trim().min(1).max(100),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        sets: z.number().int().min(1).max(12).optional(),
        repsMin: z.number().int().min(1).max(100).optional(),
        repsMax: z.number().int().min(1).max(100).optional(),
        restSec: z.number().int().min(0).max(600).optional(),
        notes: z.string().trim().max(300).optional(),
      })
    )
    .max(20),
  // Opcionais — quando ambos preenchidos, agrupam planos da mesma "geração"
  // (ex.: FB 3x = 3 chamadas saveAIWorkout com o mesmo aiGenerationId).
  // O cliente gera o id 1x e reusa nos N saves. aiGenerationLabel é a
  // forma legível pra UI ("Full Body 3x") armazenada pra evitar
  // reconstrução posterior das respostas do quiz.
  aiGenerationId: z.string().trim().min(1).max(40).optional(),
  aiGenerationLabel: z.string().trim().min(1).max(120).optional(),
});

// ─── AI History ──────────────────────────────────────────────────────────
//
// Schemas pro histórico de gerações independente do save em /workouts.
// Frontend chama POST /ai/history APÓS gerar (e antes da tela de RESULT)
// pra persistir o snapshot completo. Funciona mesmo se o user não clicar
// "Salvar" depois.

const aiExerciseSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sets: z.number().int().min(1).max(12).optional(),
  repsMin: z.number().int().min(1).max(100).optional(),
  repsMax: z.number().int().min(1).max(100).optional(),
  restSec: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(300).optional(),
  muscleGroup: z.string().trim().max(80).optional(),
  secondaryMuscleGroup: z.string().trim().max(80).optional()
});

export const saveAIHistoryBodySchema = z.object({
  generationId: z.string().trim().min(1).max(40),
  generationLabel: z.string().trim().min(1).max(120),
  // 1 entrada por dia da geração. dayIndex preservado pra ordem.
  days: z
    .array(
      z.object({
        dayIndex: z.number().int().min(0).max(20),
        dayLabel: z.string().trim().min(1).max(80),
        planName: z.string().trim().min(1).max(100),
        exercises: z.array(aiExerciseSnapshotSchema).max(20)
      })
    )
    .min(1)
    .max(10)
});

// POST /ai/history/:id/use — clona o snapshot daquele dia pra um WorkoutPlan
// novo. Sem body extra.
export const aiHistoryParamsSchema = z
  .object({
    historyPlanId: z.string().cuid()
  })
  .strict();

export type SaveAIHistoryBody = z.infer<typeof saveAIHistoryBodySchema>;
export type AIHistoryParams = z.infer<typeof aiHistoryParamsSchema>;

export type GenerateWorkoutBody = z.infer<typeof generateWorkoutBodySchema>;
export type SaveAIWorkoutBody = z.infer<typeof saveAIWorkoutBodySchema>;
export type ParseSplitBody = z.infer<typeof parseSplitBodySchema>;
export type SwapExerciseBody = z.infer<typeof swapExerciseBodySchema>;
