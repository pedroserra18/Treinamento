export default function ExercisesLoading() {
  return (
    <main style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            width: 260,
            height: 34,
            borderRadius: 8,
            background: "#1e293b",
            marginBottom: 10,
            animation: "pulse 1.2s ease-in-out infinite"
          }}
        />
        <div
          style={{
            width: 420,
            height: 16,
            borderRadius: 8,
            background: "#1e293b",
            animation: "pulse 1.2s ease-in-out infinite"
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16
        }}
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 12,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: "100%",
                height: 160,
                background: "#1e293b",
                animation: "pulse 1.2s ease-in-out infinite"
              }}
            />
            <div style={{ padding: 14 }}>
              <div
                style={{
                  width: "70%",
                  height: 18,
                  borderRadius: 8,
                  background: "#1e293b",
                  marginBottom: 10,
                  animation: "pulse 1.2s ease-in-out infinite"
                }}
              />
              <div
                style={{
                  width: "80%",
                  height: 14,
                  borderRadius: 8,
                  background: "#1e293b",
                  marginBottom: 8,
                  animation: "pulse 1.2s ease-in-out infinite"
                }}
              />
              <div
                style={{
                  width: "55%",
                  height: 14,
                  borderRadius: 8,
                  background: "#1e293b",
                  animation: "pulse 1.2s ease-in-out infinite"
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
