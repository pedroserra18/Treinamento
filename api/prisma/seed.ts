import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedExerciseInput = {
  slug: string;
  name: string;
  scope: "GLOBAL";
  primaryMuscleGroup: string;
  secondaryMuscleGroup: string | null;
  genderFocus: "UNISEX" | "FEMALE" | "MALE";
  equipment: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  thumbnailUrl: string;
  videoUrl: string;
  instructions: string;
  isCompound: boolean;
  isActive: boolean;
};

type GroupSpec = {
  primaryMuscleGroup: string;
  names: string[];
  defaultSecondary: string | null;
};

const GROUPS_20: GroupSpec[] = [
  {
    primaryMuscleGroup: "CHEST",
    defaultSecondary: "TRICEPS",
    names: [
      "Supino reto com barra",
      "Supino reto com halteres",
      "Supino inclinado com barra",
      "Supino inclinado com halteres",
      "Supino declinado com barra",
      "Supino maquina convergente",
      "Crucifixo com halteres",
      "Crucifixo inclinado com halteres",
      "Crucifixo no peck deck",
      "Crossover polia alta",
      "Crossover polia baixa",
      "Crossover no meio",
      "Flexao tradicional",
      "Flexao declinada",
      "Flexao com pegada fechada",
      "Mergulho para peito",
      "Pullover com halter",
      "Supino com pausa",
      "Supino no smith",
      "Press no cabo para peito"
    ]
  },
  {
    primaryMuscleGroup: "BACK",
    defaultSecondary: "BICEPS",
    names: [
      "Puxada frente na polia alta",
      "Puxada pegada neutra",
      "Puxada supinada",
      "Barra fixa pronada",
      "Barra fixa supinada",
      "Remada curvada com barra",
      "Remada unilateral com halter",
      "Remada baixa no cabo",
      "Remada cavalinho",
      "Remada na maquina articulada",
      "Pulldown unilateral",
      "Pullover na polia",
      "Rack pull",
      "Remada serrote no banco",
      "Remada no smith",
      "Remada com apoio no peito",
      "Puxada com triangulo",
      "Remada alta para dorsal",
      "Levantamento terra convencional",
      "Levantamento terra sumo"
    ]
  },
  {
    primaryMuscleGroup: "LEGS",
    defaultSecondary: "GLUTES",
    names: [
      "Agachamento livre com barra",
      "Agachamento frontal",
      "Agachamento no smith",
      "Hack squat",
      "Leg press 45",
      "Leg press horizontal",
      "Cadeira extensora",
      "Cadeira flexora",
      "Stiff com barra",
      "Passada com halteres",
      "Passada andando",
      "Avanco no smith",
      "Afundo bulgaro",
      "Step up no banco",
      "Agachamento sumo com halter",
      "Cadeira adutora",
      "Cadeira abdutora",
      "Levantamento terra romeno",
      "Good morning com barra",
      "Pistol squat assistido"
    ]
  },
  {
    primaryMuscleGroup: "GLUTES",
    defaultSecondary: "LEGS",
    names: [
      "Elevacao pelvica com barra",
      "Hip thrust na maquina",
      "Glute bridge unilateral",
      "Coice na polia",
      "Abducao de quadril na maquina",
      "Abducao de quadril com mini band",
      "Afundo reverso",
      "Afundo lateral",
      "Pull through no cabo",
      "Frog pump",
      "Levantamento terra romeno para gluteo",
      "Agachamento búlgaro focado em gluteo",
      "Passada longa com halter",
      "Step up alto",
      "Ponte glutea no banco",
      "Agachamento no smith com passo a frente",
      "Kettlebell swing",
      "Coice no smith",
      "Elevacao pelvica unilateral",
      "Good morning com mini band"
    ]
  },
  {
    primaryMuscleGroup: "SHOULDERS",
    defaultSecondary: "TRICEPS",
    names: [
      "Desenvolvimento militar com barra",
      "Desenvolvimento com halteres sentado",
      "Desenvolvimento maquina",
      "Arnold press",
      "Elevacao lateral com halteres",
      "Elevacao lateral na polia",
      "Elevacao frontal com halteres",
      "Face pull com corda",
      "Crucifixo inverso na maquina",
      "Crucifixo inverso com halteres",
      "Desenvolvimento landmine",
      "Elevacao Y inclinada",
      "Upright row com barra",
      "Upright row com halteres",
      "Press unilateral com halter",
      "Shoulder press no smith",
      "Press com kettlebell",
      "Rotacao externa no cabo",
      "Rotacao interna no cabo",
      "Pike push up"
    ]
  }
];

const GROUPS_10: GroupSpec[] = [
  {
    primaryMuscleGroup: "BICEPS",
    defaultSecondary: "FOREARM",
    names: [
      "Rosca direta com barra",
      "Rosca alternada com halteres",
      "Rosca martelo",
      "Rosca concentrada",
      "Rosca scott barra W",
      "Rosca scott maquina",
      "Rosca inversa com barra",
      "Rosca no cabo polia baixa",
      "Rosca spider",
      "Rosca 21 barra W"
    ]
  },
  {
    primaryMuscleGroup: "TRICEPS",
    defaultSecondary: "CHEST",
    names: [
      "Triceps na polia com corda",
      "Triceps na polia barra reta",
      "Triceps frances com halter",
      "Triceps testa barra W",
      "Mergulho nas paralelas",
      "Extensao overhead na corda",
      "Triceps maquina",
      "Triceps banco",
      "Triceps coice com halter",
      "Triceps unilateral no cabo"
    ]
  },
  {
    primaryMuscleGroup: "CALVES",
    defaultSecondary: "LEGS",
    names: [
      "Panturrilha em pe na maquina",
      "Panturrilha sentado na maquina",
      "Panturrilha no leg press",
      "Panturrilha unilateral em pe",
      "Panturrilha no smith",
      "Donkey calf raise",
      "Panturrilha no step",
      "Panturrilha sentado com halter",
      "Panturrilha em pe com halteres",
      "Panturrilha unilateral no step"
    ]
  },
  {
    primaryMuscleGroup: "FOREARM",
    defaultSecondary: "BICEPS",
    names: [
      "Rosca de punho com barra",
      "Rosca de punho reversa com barra",
      "Farmer walk com halteres",
      "Pronação de antebraco com halter",
      "Supinação de antebraco com halter",
      "Pegada isometrica na barra",
      "Rosca martelo invertida",
      "Wrist roller",
      "Hang isometrico na barra fixa",
      "Flexao de dedos com hand gripper"
    ]
  },
  {
    primaryMuscleGroup: "ABDOMEN",
    defaultSecondary: "CORE",
    names: [
      "Abdominal supra no solo",
      "Abdominal infra elevacao de pernas",
      "Crunch no cabo ajoelhado",
      "Abdominal na maquina",
      "Prancha frontal",
      "Prancha lateral",
      "Dead bug",
      "Hollow hold",
      "Russian twist",
      "Mountain climber"
    ]
  }
];

const EQUIPMENT_BY_KEYWORD: Array<{ test: RegExp; equipment: string }> = [
  { test: /barra|smith|landmine|rack/i, equipment: "Barbell" },
  { test: /halter|kettlebell/i, equipment: "Dumbbell" },
  { test: /polia|cabo|crossover|face pull|pull through|cable/i, equipment: "Cable" },
  { test: /maquina|leg press|hack|peck deck/i, equipment: "Machine" },
  { test: /flexao|prancha|mountain climber|pike|hang|isometrico|frog pump|dead bug|hollow/i, equipment: "Bodyweight" }
];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function inferEquipment(name: string): string {
  for (const rule of EQUIPMENT_BY_KEYWORD) {
    if (rule.test.test(name)) {
      return rule.equipment;
    }
  }

  return "Machine";
}

function inferDifficulty(name: string, index: number): "BEGINNER" | "INTERMEDIATE" | "ADVANCED" {
  if (/isometrico|pistol|rack pull|snatch|landmine|sumo|paralelas/i.test(name)) {
    return "ADVANCED";
  }

  if (/livre|frontal|romeno|búlgaro|unilateral|andando|martelo|overhead/i.test(name)) {
    return "INTERMEDIATE";
  }

  return index % 3 === 0 ? "INTERMEDIATE" : "BEGINNER";
}

function inferGenderFocus(group: string, index: number): "UNISEX" | "FEMALE" | "MALE" {
  if (group === "GLUTES" && index % 3 === 1) {
    return "FEMALE";
  }

  if ((group === "CHEST" || group === "BICEPS" || group === "TRICEPS") && index % 5 === 0) {
    return "MALE";
  }

  return "UNISEX";
}

function buildGroupExercises(spec: GroupSpec): SeedExerciseInput[] {
  return spec.names.map((name, index) => ({
    slug: `${slugify(name)}-${slugify(spec.primaryMuscleGroup)}-${index + 1}`,
    name,
    scope: "GLOBAL",
    primaryMuscleGroup: spec.primaryMuscleGroup,
    secondaryMuscleGroup: spec.defaultSecondary,
    genderFocus: inferGenderFocus(spec.primaryMuscleGroup, index),
    equipment: inferEquipment(name),
    difficulty: inferDifficulty(name, index),
    thumbnailUrl: "",
    videoUrl: "",
    instructions: "",
    isCompound: /supino|agachamento|remada|puxada|terra|press|afundo|passada|paralelas|kettlebell swing|thruster|clean/i.test(name),
    isActive: true
  }));
}

function buildExercises(): SeedExerciseInput[] {
  const primary = GROUPS_20.flatMap(buildGroupExercises);
  const secondary = GROUPS_10.flatMap(buildGroupExercises);

  return [...primary, ...secondary];
}

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@local.dev" },
    update: {
      normalizedEmail: "admin@local.dev",
      status: "ACTIVE",
      emailVerifiedAt: new Date()
    },
    create: {
      email: "admin@local.dev",
      normalizedEmail: "admin@local.dev",
      name: "Local Admin",
      status: "ACTIVE",
      emailVerifiedAt: new Date()
    }
  });

  const exercises = buildExercises();
  const slugs = exercises.map((exercise) => exercise.slug);

  for (const exercise of exercises) {
    await prisma.exercise.upsert({
      where: { slug: exercise.slug },
      create: {
        ...exercise,
        scope: "GLOBAL"
      } as any,
      update: {
        ...exercise,
        scope: "GLOBAL"
      } as any
    });
  }

  await prisma.exercise.deleteMany({
    where: {
      scope: "GLOBAL",
      slug: {
        notIn: slugs
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Prisma seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
