import Link from "next/link";
import { notFound } from "next/navigation";

import { getExerciseByIdService } from "@/lib/exercise-api";

type PageProps = {
  params: Promise<{ exerciseId: string }>;
};

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}

function toYouTubeEmbedUrl(url: string): string {
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/i);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }

  const longMatch = url.match(/[?&]v=([^?&/]+)/i);
  if (longMatch?.[1]) {
    return `https://www.youtube.com/embed/${longMatch[1]}`;
  }

  return url;
}

export default async function ExerciseDetailPage({ params }: PageProps) {
  const { exerciseId } = await params;
  const { data: exercise, error } = await getExerciseByIdService(exerciseId);

  if (error?.status === 404 || (!exercise && !error)) {
    notFound();
  }

  if (error && !exercise) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
        <Link href="/exercises" style={{ color: "#38bdf8", textDecoration: "none" }}>
          Voltar para listagem
        </Link>

        <section
          style={{
            marginTop: 16,
            border: "1px solid #7f1d1d",
            borderRadius: 14,
            background: "#1f1111",
            padding: 20,
            color: "#fecaca"
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Nao foi possivel abrir este exercicio</h1>
          <p style={{ margin: "0 0 14px" }}>{error.userMessage}</p>
          <Link href={`/exercises/${exerciseId}`} style={{ color: "#fda4af", textDecoration: "underline" }}>
            Tentar novamente
          </Link>
        </section>
      </main>
    );
  }

  if (!exercise) {
    notFound();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <Link href="/exercises" style={{ color: "#38bdf8", textDecoration: "none" }}>
        Voltar para listagem
      </Link>

      <section
        style={{
          marginTop: 16,
          border: "1px solid #334155",
          borderRadius: 14,
          background: "#0f172a",
          padding: 20
        }}
      >
        <h1 style={{ margin: "0 0 16px", color: "#f8fafc", fontSize: 30 }}>{exercise.name}</h1>

        <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            <strong>Grupo muscular:</strong> {exercise.primaryMuscleGroup}
          </p>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            <strong>Equipamento:</strong> {exercise.equipment}
          </p>
          <p style={{ margin: 0, color: "#cbd5e1" }}>
            <strong>Dificuldade:</strong> {exercise.difficulty}
          </p>
        </div>

        {exercise.videoUrl ? (
          <div>
            <h2 style={{ margin: "0 0 10px", color: "#f8fafc", fontSize: 20 }}>Video</h2>

            {isYouTubeUrl(exercise.videoUrl) ? (
              <iframe
                src={toYouTubeEmbedUrl(exercise.videoUrl)}
                title={`Video de ${exercise.name}`}
                style={{ width: "100%", height: 420, border: 0, borderRadius: 10 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={exercise.videoUrl}
                controls
                style={{ width: "100%", borderRadius: 10, background: "#020617" }}
              >
                Seu navegador nao suporta reproducao de video.
              </video>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#94a3b8" }}>Este exercicio ainda nao possui video.</p>
        )}
      </section>
    </main>
  );
}
