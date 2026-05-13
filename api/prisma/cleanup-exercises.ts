/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const renames: Array<{ from: string; to: string }> = [
  { from: "Pulldown unilateral", to: "Puxada unilateral" },
  { from: "Upright row com barra", to: "Remada alta com barra" },
  { from: "Upright row com halteres", to: "Remada alta com halteres" },
  { from: "Shoulder press no smith", to: "Desenvolvimento no smith" },
  { from: "Press com kettlebell", to: "Desenvolvimento com kettlebell" },
  { from: "Press unilateral com halter", to: "Desenvolvimento unilateral com halter" },
  { from: "Agachamento isometrico na parede", to: "Cadeira na parede" },
  { from: "Donkey calf raise", to: "Burrinho" },
  { from: "Extensao overhead na corda", to: "Triceps frances na corda" },
  { from: "Hang isometrico na barra fixa", to: "Pendurado isometrico na barra" },
  { from: "Crunch no cabo ajoelhado", to: "Abdominal no cabo ajoelhado" },
];

async function main() {
  const all = await prisma.exercise.findMany({ where: { scope: "GLOBAL" } });
  const originals = all.filter((e) => e.id.startsWith("cmnnin"));
  const mine = all.filter((e) => e.id.startsWith("cmoxah"));

  console.log("Before:");
  console.log("  Originals:", originals.length, "active:", originals.filter((e) => e.isActive).length);
  console.log("  Mine:", mine.length, "active:", mine.filter((e) => e.isActive).length);

  // Step 1: Reactivate all originals
  const reactivated = await prisma.exercise.updateMany({
    where: { id: { startsWith: "cmnnin" } },
    data: { isActive: true },
  });
  console.log("\n[1] Reactivated originals:", reactivated.count);

  // Step 2: Delete duplicates (mine whose normalized name matches an original)
  const origNames = new Set(originals.map((o) => normalize(o.name)));
  const duplicates = mine.filter((m) => origNames.has(normalize(m.name)));
  console.log("\n[2] Duplicates to delete:", duplicates.length);

  const deleted = await prisma.exercise.deleteMany({
    where: { id: { in: duplicates.map((d) => d.id) } },
  });
  console.log("    Deleted:", deleted.count);

  // Step 3: Rename the 11 "Brazilian-Portuguese" cases
  console.log("\n[3] Renames:");
  for (const r of renames) {
    const row = await prisma.exercise.findFirst({
      where: { name: r.from, id: { startsWith: "cmoxah" } },
    });
    if (!row) {
      console.log(`    SKIP (not found): ${r.from}`);
      continue;
    }
    await prisma.exercise.update({ where: { id: row.id }, data: { name: r.to } });
    console.log(`    OK: ${r.from} -> ${r.to}`);
  }

  // Final state
  const after = await prisma.exercise.findMany({ where: { scope: "GLOBAL" } });
  const aOrig = after.filter((e) => e.id.startsWith("cmnnin"));
  const aMine = after.filter((e) => e.id.startsWith("cmoxah"));
  console.log("\nAfter:");
  console.log("  Total GLOBAL:", after.length);
  console.log("  Originals:", aOrig.length, "active:", aOrig.filter((e) => e.isActive).length, "with thumb:", aOrig.filter((e) => e.thumbnailUrl).length);
  console.log("  Mine (kept):", aMine.length, "active:", aMine.filter((e) => e.isActive).length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
