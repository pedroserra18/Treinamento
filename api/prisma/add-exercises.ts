/// <reference types="node" />
import { PrismaClient, MuscleGroup, ExerciseDifficulty } from "@prisma/client";

const prisma = new PrismaClient();

const newExercises = [
  {
    slug: "supino-inclinado-na-maquina-chest",
    name: "Supino inclinado na máquina",
    primaryMuscleGroup: MuscleGroup.CHEST,
    secondaryMuscleGroup: MuscleGroup.TRICEPS,
    equipment: "MACHINE",
    isCompound: true,
  },
  {
    slug: "elevacao-de-panturrilha-unilateral-na-maquina-calves",
    name: "Elevação de panturrilha unilateral na máquina",
    primaryMuscleGroup: MuscleGroup.CALVES,
    secondaryMuscleGroup: null,
    equipment: "MACHINE",
    isCompound: false,
  },
  {
    slug: "desenvolvimento-pegada-neutra-na-maquina-shoulders",
    name: "Desenvolvimento pegada neutra na máquina",
    primaryMuscleGroup: MuscleGroup.SHOULDERS,
    secondaryMuscleGroup: MuscleGroup.TRICEPS,
    equipment: "MACHINE",
    isCompound: true,
  },
  {
    slug: "elevacao-lateral-na-maquina-shoulders",
    name: "Elevação lateral na máquina",
    primaryMuscleGroup: MuscleGroup.SHOULDERS,
    secondaryMuscleGroup: null,
    equipment: "MACHINE",
    isCompound: false,
  },
];

async function main() {
  for (const e of newExercises) {
    const created = await prisma.exercise.create({
      data: {
        slug: e.slug,
        name: e.name,
        scope: "GLOBAL",
        primaryMuscleGroup: e.primaryMuscleGroup,
        secondaryMuscleGroup: e.secondaryMuscleGroup,
        equipment: e.equipment,
        difficulty: ExerciseDifficulty.INTERMEDIATE,
        isCompound: e.isCompound,
        isBodyweight: false,
        allowsExtraLoad: false,
        isActive: true,
      },
    });
    console.log(`OK: ${created.name} (id=${created.id})`);
  }

  const total = await prisma.exercise.count({ where: { scope: "GLOBAL", isActive: true } });
  console.log(`\nTotal de exercícios GLOBAL ativos: ${total}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
