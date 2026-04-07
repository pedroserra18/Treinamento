"use client";

import Link from "next/link";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ExercisesError({ error, reset }: ErrorProps) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
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
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Nao foi possivel carregar os exercicios</h1>
        <p style={{ margin: "0 0 8px" }}>
          Ocorreu um erro inesperado. Tente novamente em alguns segundos.
        </p>
        <p style={{ margin: "0 0 14px", color: "#fca5a5", fontSize: 13 }}>
          Detalhe tecnico: {error.message}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
          <Link href="/" style={{ color: "#fda4af", textDecoration: "underline" }}>
            Voltar ao dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
