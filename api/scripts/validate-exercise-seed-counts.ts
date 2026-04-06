import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const expectedCounts: Record<string, number> = {
  CHEST: 20,
  BACK: 20,
  LEGS: 20,
  GLUTES: 20,
  SHOULDERS: 20,
  BICEPS: 10,
  TRICEPS: 10,
  CALVES: 10,
  FOREARM: 10,
  ABDOMEN: 10
};

async function main() {
  const grouped = await prisma.exercise.groupBy({
    by: ["primaryMuscleGroup"],
    _count: { _all: true },
    where: { scope: "GLOBAL", isActive: true }
  });

  const result = grouped
    .map((row) => ({
      primaryMuscleGroup: row.primaryMuscleGroup,
      count: row._count._all
    }))
    .sort((a, b) => a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup));

  console.log(JSON.stringify(result, null, 2));

  const problems: string[] = [];
  for (const [group, expected] of Object.entries(expectedCounts)) {
    const found = result.find((row) => row.primaryMuscleGroup === group)?.count ?? 0;
    if (found !== expected) {
      problems.push(`${group}: expected ${expected}, found ${found}`);
    }
  }

  if (problems.length > 0) {
    console.error("Seed count validation failed:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Seed count validation passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
