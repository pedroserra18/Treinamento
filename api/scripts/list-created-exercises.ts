import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.exercise.findMany({
    select: {
      slug: true,
      name: true,
      scope: true,
      primaryMuscleGroup: true,
      secondaryMuscleGroup: true,
      equipment: true,
      thumbnailUrl: true,
      videoUrl: true
    },
    orderBy: [{ primaryMuscleGroup: "asc" }, { name: "asc" }]
  });

  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const key = row.primaryMuscleGroup;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    const bucket = grouped.get(key)!;
    bucket.push(row.name);
  }

  const output = Array.from(grouped.entries()).map(([muscleGroup, values]) => ({
    primaryMuscleGroup: muscleGroup,
    count: values.length,
    sample: values.slice(0, 5)
  }));

  console.log(JSON.stringify(output, null, 2));
  console.log("\nDetailed list (slug, name, primary, secondary, equipment, scope):");
  console.log(
    JSON.stringify(
      rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        primaryMuscleGroup: row.primaryMuscleGroup,
        secondaryMuscleGroup: row.secondaryMuscleGroup,
        equipment: row.equipment,
        scope: row.scope
      })),
      null,
      2
    )
  );
  console.log(`TOTAL_EXERCISES=${rows.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
