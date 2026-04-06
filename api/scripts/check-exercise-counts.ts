import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ExerciseDistributionRow = {
  muscleGroup: string;
  isPrimary: boolean;
  total: bigint;
};

async function main() {
  const rows = await prisma.$queryRaw<ExerciseDistributionRow[]>`
    SELECT
      "muscleGroup",
      "isPrimary",
      COUNT(*)::bigint AS total
    FROM exercises
    GROUP BY "muscleGroup", "isPrimary"
    ORDER BY "muscleGroup" ASC, "isPrimary" DESC
  `;

  const printable = rows.map((row) => ({
    muscleGroup: row.muscleGroup,
    isPrimary: row.isPrimary,
    total: Number(row.total)
  }));

  console.log(JSON.stringify(printable, null, 2));

  const invalid = printable.filter((row) => {
    if (row.isPrimary) {
      return row.total !== 20;
    }

    return row.total !== 10;
  });

  if (invalid.length > 0) {
    console.error("Invalid exercise distribution detected:", JSON.stringify(invalid, null, 2));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
