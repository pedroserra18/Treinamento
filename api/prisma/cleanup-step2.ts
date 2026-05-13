/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const exactDuplicatesByName: Array<{ name: string; group: string }> = [
  { name: "Puxada unilateral", group: "BACK" },
  { name: "Remada alta com barra", group: "SHOULDERS" },
  { name: "Remada alta com halteres", group: "SHOULDERS" },
  { name: "Desenvolvimento com kettkettlebell", group: "SHOULDERS" },
  { name: "Desenvolvimento com kettlebell", group: "SHOULDERS" },
  { name: "Desenvolvimento unilateral com halter", group: "SHOULDERS" },
];

const semanticSameByMineName: string[] = [
  "Burrinho",
  "Arnold press",
  "Pendurado isometrico na barra",
];

const PRE_EXISTING_DUP_ID_TO_DELETE = "cmnnin1su001zvw6sdt82zkax";

async function main() {
  let totalDeleted = 0;

  console.log("[1] Apagando 5 duplicatas exatas (cmoxah, sem imagem):");
  const exactNames = [
    "Puxada unilateral",
    "Remada alta com barra",
    "Remada alta com halteres",
    "Desenvolvimento com kettlebell",
    "Desenvolvimento unilateral com halter",
  ];
  for (const name of exactNames) {
    const row = await prisma.exercise.findFirst({ where: { name, id: { startsWith: "cmoxah" } } });
    if (!row) {
      console.log(`   SKIP (não encontrado): ${name}`);
      continue;
    }
    await prisma.exercise.delete({ where: { id: row.id } });
    console.log(`   OK: ${name} (id=${row.id})`);
    totalDeleted++;
  }

  console.log("\n[2] Apagando 3 duplicatas semânticas (mesmo exercício, nomes diferentes):");
  for (const name of semanticSameByMineName) {
    const row = await prisma.exercise.findFirst({ where: { name, id: { startsWith: "cmoxah" } } });
    if (!row) {
      console.log(`   SKIP (não encontrado): ${name}`);
      continue;
    }
    await prisma.exercise.delete({ where: { id: row.id } });
    console.log(`   OK: ${name} (id=${row.id})`);
    totalDeleted++;
  }

  console.log("\n[3] Apagando duplicata pré-existente nos originais (Stiff com barra sem uso):");
  const stiff = await prisma.exercise.findUnique({ where: { id: PRE_EXISTING_DUP_ID_TO_DELETE } });
  if (stiff) {
    await prisma.exercise.delete({ where: { id: stiff.id } });
    console.log(`   OK: ${stiff.name} (id=${stiff.id})`);
    totalDeleted++;
  } else {
    console.log(`   SKIP: ${PRE_EXISTING_DUP_ID_TO_DELETE} não encontrado`);
  }

  console.log(`\nTotal apagado: ${totalDeleted}`);

  const after = await prisma.exercise.findMany({ where: { scope: "GLOBAL", isActive: true } });
  console.log("Exercícios GLOBAL ativos depois:", after.length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
