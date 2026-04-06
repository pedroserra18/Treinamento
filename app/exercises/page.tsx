import Image from "next/image";
import Link from "next/link";

import { fetchExercises } from "@/lib/exercise-api";

const placeholderImage =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><g fill="#94a3b8" font-family="Arial, sans-serif" text-anchor="middle"><text x="320" y="176" font-size="26" font-weight="700">Sem imagem</text><text x="320" y="206" font-size="14">Thumbnail indisponivel para este exercicio</text></g></svg>'
  );

export default async function ExercisesPage() {
  const exercises = await fetchExercises();

  return (
    <main style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#f8fafc" }}>Explorar Exercicios</h1>
        <p style={{ marginTop: 8, color: "#94a3b8" }}>
          Lista com suporte de midia. Quando o exercicio nao tem thumbnail, um placeholder e exibido.
        </p>
      </header>

      {exercises.length === 0 ? (
        <div
          style={{
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 24,
            background: "#0f172a",
            color: "#cbd5e1"
          }}
        >
          Nenhum exercicio encontrado.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16
          }}
        >
          {exercises.map((exercise) => (
            <article
              key={exercise.id}
              style={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 12,
                overflow: "hidden"
              }}
            >
              <Image
                src={exercise.thumbnailUrl ?? placeholderImage}
                alt={`Thumbnail de ${exercise.name}`}
                width={640}
                height={360}
                unoptimized
                style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
              />

              <div style={{ padding: 14 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#f8fafc" }}>{exercise.name}</h2>

                <p style={{ margin: "0 0 6px", color: "#cbd5e1", fontSize: 14 }}>
                  Grupo muscular: {exercise.primaryMuscleGroup}
                </p>
                <p style={{ margin: "0 0 12px", color: "#cbd5e1", fontSize: 14 }}>
                  Dificuldade: {exercise.difficulty}
                </p>

                <Link
                  href={`/exercises/${exercise.id}`}
                  style={{ color: "#38bdf8", fontWeight: 600, textDecoration: "none" }}
                >
                  Ver detalhe
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
