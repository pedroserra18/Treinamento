import { z } from "zod";

export const allowedDivisionSchema = z.enum([
  "Full Body",
  "Push Pull Legs",
  "Upper Lower",
  "Push Pull Legs 2x",
  "Upper Lower 2x",
  "Torso Legs",
  "Bro Split"
]);

export type AllowedDivision = z.infer<typeof allowedDivisionSchema>;

export type RecommendationExercise = {
  id: string;
  name: string;
  primaryMuscleGroup: string;
  genderFocus: "UNISEX" | "FEMALE" | "MALE";
  difficultyTier: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  sets: number;
  reps: string;
  rir: number;
  restSeconds: number;
};

export type RecommendationDay = {
  dayNumber: number;
  focus: string;
  exercises: RecommendationExercise[];
};

export type WorkoutRecommendation = {
  division: AllowedDivision;
  daysPerWeek: number;
  rationale: string;
  selectionStrategy: string;
  sessions: RecommendationDay[];
};
