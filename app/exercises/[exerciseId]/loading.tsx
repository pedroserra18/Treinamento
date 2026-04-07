export default function ExerciseDetailLoading() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <div
        style={{
          width: 150,
          height: 16,
          borderRadius: 8,
          background: "#1e293b",
          marginBottom: 18,
          animation: "pulse 1.2s ease-in-out infinite"
        }}
      />

      <section
        style={{
          border: "1px solid #334155",
          borderRadius: 14,
          background: "#0f172a",
          padding: 20
        }}
      >
        <div
          style={{
            width: "60%",
            height: 30,
            borderRadius: 8,
            background: "#1e293b",
            marginBottom: 18,
            animation: "pulse 1.2s ease-in-out infinite"
          }}
        />

        <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                width: "45%",
                height: 14,
                borderRadius: 8,
                background: "#1e293b",
                animation: "pulse 1.2s ease-in-out infinite"
              }}
            />
          ))}
        </div>

        <div
          style={{
            width: "100%",
            height: 340,
            borderRadius: 10,
            background: "#1e293b",
            animation: "pulse 1.2s ease-in-out infinite"
          }}
        />
      </section>
    </main>
  );
}
