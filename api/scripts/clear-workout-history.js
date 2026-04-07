const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const [historyCount, completedSessionsCount] = await Promise.all([
    prisma.workoutHistory.count(),
    prisma.workoutSession.count({
      where: {
        status: "COMPLETED"
      }
    })
  ]);

  await prisma.$transaction([
    prisma.workoutHistory.deleteMany({}),
    prisma.workoutSession.deleteMany({
      where: {
        status: "COMPLETED"
      }
    })
  ]);

  console.log(
    JSON.stringify(
      {
        removedHistoryEntries: historyCount,
        removedCompletedSessions: completedSessionsCount,
        message: "Workout history reset completed"
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
