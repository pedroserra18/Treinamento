import { listExercises } from "../src/modules/exercise/exercise.service";

async function main() {
  try {
    const rows = await listExercises({}, { userRole: "USER" });
    console.log("ok", rows.length);
    if (rows.length > 0) {
      console.log(
        JSON.stringify(
          {
            sample: {
              id: rows[0].id,
              name: rows[0].name,
              primaryMuscleGroup: rows[0].primaryMuscleGroup,
              secondaryMuscleGroup: rows[0].secondaryMuscleGroup
            }
          },
          null,
          2
        )
      );
    }
  } catch (error) {
    console.error("listExercises failed");
    console.error(error);
    process.exitCode = 1;
  }
}

void main();
