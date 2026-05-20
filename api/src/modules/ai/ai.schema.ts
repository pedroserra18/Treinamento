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
});

// Interpreta uma divisão escrita em linguagem natural ("Outro" no quiz).
export const parseSplitBodySchema = z.object({
  description: z.string().trim().min(1, "Descreve a divisão").max(1000),
  daysPerWeek: z.coerce.number().int().min(1).max(7).optional(),
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
});

export type GenerateWorkoutBody = z.infer<typeof generateWorkoutBodySchema>;
export type SaveAIWorkoutBody = z.infer<typeof saveAIWorkoutBodySchema>;
export type ParseSplitBody = z.infer<typeof parseSplitBodySchema>;
