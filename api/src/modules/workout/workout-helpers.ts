import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

// Helpers compartilhados entre os serviços de planos (workout.service) e de
// sessões/histórico (workout-session.service). Ficam aqui para evitar import
// circular entre os dois.

export const DIVISION_BY_DAYS: Record<number, string[]> = {
  1: ["Full Body", "Upper Lower"],
  2: ["Full Body", "Upper Lower"],
  3: ["Push Pull Legs", "Full Body"],
  4: ["Upper Lower 2x", "Torso Limbs"],
  5: ["Bro Split", "Push Pull Legs"],
  6: ["Push Pull Legs 2x", "Upper Lower 2x"],
  7: ["Push Pull Legs 2x", "Bro Split"]
};

export async function assertOwnedPlan(planId: string, userId: string): Promise<void> {
  const plan = await prisma.workoutPlan.findFirst({
    where: {
      id: planId,
      userId,
      status: {
        in: ["ACTIVE", "DRAFT"]
      }
    },
    select: { id: true }
  });

  if (!plan) {
    throw new AppError("Workout plan not found for this user", {
      statusCode: 404,
      code: "WORKOUT_PLAN_NOT_FOUND"
    });
  }
}
