import { z } from "zod";

export const generateWorkoutBodySchema = z.object({
  prompt: z.string().trim().min(1, "Descreve o treino que pretendes").max(3000),
  muscleGroup: z
    .enum(["Peito", "Costas", "Quadríceps", "Posterior de Coxa", "Glúteo", "Ombros", "Braços", ""])
    .optional(),
  level: z.enum(["Iniciante", "Intermediário", "Avançado", ""]).optional(),
  durationMin: z.enum(["30", "45", "60", "90", "120", ""]).optional(),
  goal: z.enum(["Hipertrofia", "Força", "Resistência", "Emagrecimento", ""]).optional(),
  weekDays: z.enum(["2", "3", "4", "5", "6", ""]).optional(),
  split: z
    .enum(["Full Body", "Upper/Lower", "Push/Pull/Legs", "Torso/Limbs", "Bro Split", ""])
    .optional(),
  equipment: z
    .enum(["Academia (completa)", "Casa com equipamentos", "Sem equipamento", ""])
    .optional(),
  advancedTechniques: z.boolean().optional(),
  injuries: z.string().trim().max(200).optional(),
  gender: z.enum(["Masculino", "Feminino", ""]).optional(),
  usedExercises: z.array(z.string().trim().min(1).max(200)).max(80).optional(),
  heightCm: z.number().int().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  exerciseCount: z.enum(["Curto", "Médio", "Longo", "IA decide", ""]).optional(),
  rirTarget: z.enum(["Falha", "RIR 1-2", "RIR 3+", "IA decide", ""]).optional(),
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
