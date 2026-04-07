import Link from "next/link";

export default function Home() {
	const recommendations = [
		{
			id: "hipertrofia-a",
			title: "Hipertrofia A",
			focus: "Peito, Ombro e Triceps",
			duration: "45-55 min",
			difficulty: "Intermediario",
			highlights: ["Supino reto", "Desenvolvimento", "Triceps corda"],
			startHref: "/exercises",
		},
		{
			id: "forca-b",
			title: "Forca B",
			focus: "Costas e Pernas",
			duration: "50-60 min",
			difficulty: "Avancado",
			highlights: ["Agachamento", "Levantamento terra", "Remada curvada"],
			startHref: "/exercises",
		},
	];

	return (
		<main className="dashboard-root">
			<div className="dashboard-backdrop" aria-hidden="true" />

			<section className="dashboard-hero card-surface reveal-1">
				<p className="eyebrow">Dashboard de treino</p>
				<h1>Seu plano premium para hoje</h1>
				<p>
					Visualize recomendacoes e inicie sua sessao com um clique. Layout pensado para foco total no
					treino, com leitura rapida no celular e no desktop.
				</p>
				<div className="hero-badges">
					<span>2 recomendacoes ativas</span>
					<span>Meta semanal: 4 treinos</span>
					<span>Consistencia: 87%</span>
				</div>
			</section>

			<section className="dashboard-section reveal-2">
				<div className="section-headline">
					<h2>Recomendacoes de treino</h2>
					<p>Escolha um bloco e comece agora.</p>
				</div>
				<div className="recommendation-grid">
					{recommendations.map((plan) => (
						<article className="recommendation-card card-surface" key={plan.id}>
							<div className="card-top">
								<p className="plan-focus">{plan.focus}</p>
								<h3>{plan.title}</h3>
							</div>
							<div className="plan-meta">
								<span>{plan.duration}</span>
								<span>{plan.difficulty}</span>
							</div>
							<ul>
								{plan.highlights.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
							<Link href={plan.startHref} className="primary-button">
								Comecar treino
							</Link>
						</article>
					))}
				</div>
			</section>

			<section className="dashboard-section reveal-3">
				<div className="section-headline">
					<h2>Atalhos</h2>
					<p>Acesse rapido as areas chave.</p>
				</div>
				<div className="shortcut-grid">
					<Link className="shortcut-card card-surface" href="/exercises">
						<p className="shortcut-label">Explorar treinos</p>
						<strong>Biblioteca de exercicios</strong>
						<span>Filtre por grupo muscular e equipamento.</span>
					</Link>
					<Link className="shortcut-card card-surface" href="/history">
						<p className="shortcut-label">Historico</p>
						<strong>Sessoes concluidas</strong>
						<span>Veja volume, carga e ritmo da semana.</span>
					</Link>
				</div>
			</section>
		</main>
	);
}
