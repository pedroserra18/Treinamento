const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const suffixes = ["@example.com", "@local.dev"];

  const testUsers = await prisma.user.findMany({
    where: {
      isDeleted: false,
      OR: suffixes.map((suffix) => ({
        email: { endsWith: suffix }
      }))
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      email: true,
      createdAt: true
    }
  });

  const keep = testUsers.slice(0, 10);
  const remove = testUsers.slice(10);

  if (remove.length > 0) {
    const ids = remove.map((user) => user.id);
    const now = new Date();

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { id: { in: ids } },
        data: {
          isDeleted: true,
          deletedAt: now,
          status: "DISABLED"
        }
      }),
      prisma.authProvider.updateMany({
        where: {
          userId: { in: ids },
          revokedAt: null
        },
        data: {
          revokedAt: now
        }
      })
    ]);
  }

  console.log(
    JSON.stringify(
      {
        totalTestBefore: testUsers.length,
        kept: keep.length,
        removed: remove.length,
        keptEmails: keep.map((user) => user.email)
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
