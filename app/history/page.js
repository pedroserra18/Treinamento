import Link from "next/link";

export default function HistoryPage() {
	return (
		<main className="dashboard-root">
			<section className="card-surface dashboard-hero reveal-1">
				<p className="eyebrow">Historico</p>
				<h1>Sessoes concluidas</h1>
				<p>
					Esta area esta pronta para receber seus dados de historico de treinos. Enquanto isso, voce pode
					continuar treinando e explorando exercicios.
				</p>
				<div className="hero-badges">
					<Link href="/" className="primary-button">
						Voltar ao dashboard
					</Link>
				</div>
			</section>
		</main>
	);
}
