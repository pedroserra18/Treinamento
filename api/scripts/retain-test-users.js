const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const TEST_EMAIL_SUFFIXES = ["@example.com", "@local.dev"];
const AUTOMATED_TEST_LOCAL_PART = /^[a-z0-9-]+-\d{10,}(?:-[a-z0-9]{3,8})?$/i;
const TEST_LOCAL_PART_PREFIXES = [
  "test",
  "teste",
  "qa",
  "mock",
  "demo",
  "seed",
  "tmp",
  "temp",
  "fake",
  "recover",
  "authcheck",
  "logincheck",
  "cadastro.teste"
];

function isTestAccountByEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const [localPart = ""] = normalized.split("@");

  if (TEST_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  if (TEST_LOCAL_PART_PREFIXES.some((prefix) => localPart.startsWith(prefix))) {
    return true;
  }

  if (localPart.includes(".teste") || localPart.includes(".test")) {
    return true;
  }

  return AUTOMATED_TEST_LOCAL_PART.test(localPart);
}

async function main() {
  const allUsers = await prisma.user.findMany({
    where: {
      isDeleted: false
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      email: true,
      createdAt: true
    }
  });

  const testUsers = allUsers.filter((user) => isTestAccountByEmail(user.email));

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
