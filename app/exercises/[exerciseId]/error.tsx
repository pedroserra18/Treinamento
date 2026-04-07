"use client";

import Link from "next/link";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ExerciseDetailError({ error, reset }: ErrorProps) {
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
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Erro ao carregar detalhes do exercicio</h1>
        <p style={{ margin: "0 0 8px" }}>Tente novamente em instantes.</p>
        <p style={{ margin: "0 0 14px", color: "#fca5a5", fontSize: 13 }}>
          Detalhe tecnico: {error.message}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: "#991b1b",
            color: "#fee2e2",
            border: "1px solid #b91c1c",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
