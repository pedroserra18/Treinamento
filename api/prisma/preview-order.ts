/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
  });
  all.sort((a, b) => {
    const g = a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup);
    if (g !== 0) return g;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  let currentGroup = "";
  for (const e of all) {
    if (e.primaryMuscleGroup !== currentGroup) {
      currentGroup = e.primaryMuscleGroup;
      console.log(`\n=== ${currentGroup} ===`);
    }
    console.log(`  ${e.name}`);
  }
  console.log(`\nTotal: ${all.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
