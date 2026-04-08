# Sentry Alerting Strategy (Production)

## Objetivo
Detectar erros criticos com baixo ruido, com resposta rapida para falhas reais em API e frontend.

## Escopo de alertas
- `P0` indisponibilidade: picos de erro 5xx ou crash de processo.
- `P1` regressao critica: novas issues com alto volume em rotas de autenticacao, treinos e historico.
- `P2` degradacao: aumento de erros nao fatais com impacto parcial.

## Regras recomendadas
1. `P0` Backend fatal/unhandled:
- Condicao: evento `level:error|fatal` com tag `error_type` em `process_uncaught_exception|process_unhandled_rejection`.
- Threshold: >= 1 evento em 5 min.
- Canal: PagerDuty/telefone + Slack #incidentes.

2. `P1` API 5xx em endpoints criticos:
- Condicao: issues com status code >= 500 e endpoint em `/api/v1/auth/*`, `/api/v1/workouts/*`.
- Threshold: >= 10 eventos em 10 min por issue.
- Canal: Slack #backend-alerts.

3. `P1` Frontend crash:
- Condicao: nova issue no release atual com >= 20 usuarios afetados em 30 min.
- Canal: Slack #frontend-alerts + criacao automatica de ticket.

4. `P2` Tendencia de degradacao:
- Condicao: aumento de 2x na taxa de erro vs. baseline de 24h.
- Canal: Slack #observabilidade.

## Boas praticas
- Versionar release (`release`) em frontend e backend para facilitar regressao.
- Usar ownership rules por modulo (auth, workouts, admin).
- Habilitar metric alerts por ambiente (`production` apenas).
- Revisar tuning de threshold semanalmente para reduzir ruido.
