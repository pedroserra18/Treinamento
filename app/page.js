import Link from "next/link";

export default function Home() {
	return (
		<main style={{ padding: 32 }}>
			<h1 style={{ color: "#f8fafc", marginTop: 0 }}>Academia App</h1>
			<p style={{ color: "#cbd5e1" }}>Navegue para explorar exercicios com midia.</p>

			<Link href="/exercises" style={{ color: "#38bdf8", fontWeight: 600, textDecoration: "none" }}>
				Abrir lista de exercicios
			</Link>
		</main>
	);
}
