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

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL" },
    orderBy: { createdAt: "asc" },
  });

  console.log("Total GLOBAL:", all.length);

  // Show the FIRST 20 to confirm what an "original" looks like (oldest createdAt)
  console.log("\n--- Oldest 5 rows (likely originals) ---");
  for (const e of all.slice(0, 5)) {
    console.log(`id=${e.id} | slug=${e.slug} | name=${e.name} | active=${e.isActive} | thumb=${e.thumbnailUrl ? "Y" : "N"} | created=${e.createdAt.toISOString()}`);
  }

  // Group by createdAt date — should reveal: old rows (pre-seed) vs new rows (from my seed run)
  const byDate = new Map<string, number>();
  for (const e of all) {
    const day = e.createdAt.toISOString().slice(0, 10);
    byDate.set(day, (byDate.get(day) ?? 0) + 1);
  }
  console.log("\n--- Rows grouped by createdAt date ---");
  for (const [day, count] of [...byDate.entries()].sort()) {
    console.log(`${day}: ${count}`);
  }

  // Look specifically at rows that have ID prefix "cmnnin" vs "cmoxah" to distinguish
  const cmnnin = all.filter((e) => e.id.startsWith("cmnnin"));
  const cmoxah = all.filter((e) => e.id.startsWith("cmoxah"));
  const otherPrefixes = all.filter((e) => !e.id.startsWith("cmnnin") && !e.id.startsWith("cmoxah"));
  console.log("\n--- By ID prefix ---");
  console.log("cmnnin (old seed):", cmnnin.length, "| active:", cmnnin.filter((e) => e.isActive).length, "| with thumb:", cmnnin.filter((e) => e.thumbnailUrl).length);
  console.log("cmoxah (my recent seed):", cmoxah.length, "| active:", cmoxah.filter((e) => e.isActive).length, "| with thumb:", cmoxah.filter((e) => e.thumbnailUrl).length);
  console.log("other prefixes:", otherPrefixes.length);

  // Now: cmnnin = originals; cmoxah = mine
  const originals = cmnnin;
  const mine = cmoxah;

  // Map originals by normalized name -> id
  const origByName = new Map<string, { id: string; name: string; group: string }>();
  for (const o of originals) {
    origByName.set(normalize(o.name), { id: o.id, name: o.name, group: o.primaryMuscleGroup });
  }

  const duplicates: Array<{ mineId: string; mineName: string; mineGroup: string; origName: string; origGroup: string; mineActive: boolean }> = [];
  const trulyNew: Array<{ id: string; name: string; group: string; active: boolean }> = [];
  for (const m of mine) {
    const match = origByName.get(normalize(m.name));
    if (match) {
      duplicates.push({ mineId: m.id, mineName: m.name, mineGroup: m.primaryMuscleGroup, origName: match.name, origGroup: match.group, mineActive: m.isActive });
    } else {
      trulyNew.push({ id: m.id, name: m.name, group: m.primaryMuscleGroup, active: m.isActive });
    }
  }

  console.log("\n=== Duplicates (mine matching an original by normalized name) ===");
  console.log("Count:", duplicates.length);
  const dupIds = duplicates.map((d) => d.mineId);
  const dupInHistory = await prisma.workoutHistory.findMany({ where: { exerciseId: { in: dupIds } }, select: { exerciseId: true } });
  const dupInPlan = await prisma.workoutPlanExercise.findMany({ where: { exerciseId: { in: dupIds } }, select: { exerciseId: true } });
  const dupInPinned = await prisma.pinnedExercise.findMany({ where: { exerciseId: { in: dupIds } }, select: { exerciseId: true } });
  const usedDup = new Set<string>([
    ...dupInHistory.map((x) => x.exerciseId),
    ...dupInPlan.map((x) => x.exerciseId),
    ...dupInPinned.map((x) => x.exerciseId),
  ]);
  console.log("Duplicates in use:", usedDup.size);

  console.log("\n=== Truly new (mine without name match to any original) ===");
  console.log("Count:", trulyNew.length);
  const newIds = trulyNew.map((n) => n.id);
  const newInHistory = await prisma.workoutHistory.findMany({ where: { exerciseId: { in: newIds } }, select: { exerciseId: true } });
  const newInPlan = await prisma.workoutPlanExercise.findMany({ where: { exerciseId: { in: newIds } }, select: { exerciseId: true } });
  const newInPinned = await prisma.pinnedExercise.findMany({ where: { exerciseId: { in: newIds } }, select: { exerciseId: true } });
  const usedNew = new Set<string>([
    ...newInHistory.map((x) => x.exerciseId),
    ...newInPlan.map((x) => x.exerciseId),
    ...newInPinned.map((x) => x.exerciseId),
  ]);
  console.log("Truly-new in use:", usedNew.size);

  console.log("\n--- TRULY NEW (will be kept) ---");
  for (const n of trulyNew) {
    console.log(`${n.group.padEnd(11)} | ${n.name}${usedNew.has(n.id) ? "  [IN_USE]" : ""}`);
  }

  console.log("\n--- ORIGINALS that need REACTIVATION ---");
  const origInactive = originals.filter((e) => !e.isActive);
  console.log("Count:", origInactive.length, "| with thumb:", origInactive.filter((e) => e.thumbnailUrl).length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
