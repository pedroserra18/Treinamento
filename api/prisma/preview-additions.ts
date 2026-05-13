/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const proposed = [
  { name: "Supino inclinado na máquina", group: "CHEST", equipment: "MACHINE" },
  { name: "Extensão unilateral de tríceps na polia", group: "TRICEPS", equipment: "CABLE" },
  { name: "Rosca Scott máquina", group: "BICEPS", equipment: "MACHINE" },
  { name: "Elevação de panturrilha unilateral na máquina", group: "CALVES", equipment: "MACHINE" },
  { name: "Desenvolvimento pegada neutra na máquina", group: "SHOULDERS", equipment: "MACHINE" },
  { name: "Elevação lateral na máquina", group: "SHOULDERS", equipment: "MACHINE" },
];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  const all = await prisma.exercise.findMany({
    where: { scope: "GLOBAL", isActive: true },
  });

  console.log("Verificando duplicatas e exercícios similares...\n");
  for (const p of proposed) {
    console.log(`=== ${p.name} (${p.group}, ${p.equipment}) ===`);
    const exact = all.find((e) => norm(e.name) === norm(p.name));
    if (exact) {
      console.log(`  ⚠ DUPLICATA EXATA já existe: "${exact.name}" (id=${exact.id})`);
    } else {
      console.log(`  ✓ Sem duplicata exata`);
    }
    // Show similar exercises in same group
    const groupMatches = all.filter((e) => e.primaryMuscleGroup === p.group);
    const tokens = norm(p.name).split(" ").filter((t) => t.length > 3);
    const similar = groupMatches.filter((e) => {
      const eNorm = norm(e.name);
      return tokens.some((t) => eNorm.includes(t)) && norm(e.name) !== norm(p.name);
    });
    if (similar.length > 0) {
      console.log(`  Exercícios similares no grupo ${p.group}:`);
      for (const s of similar) console.log(`    - ${s.name}`);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
