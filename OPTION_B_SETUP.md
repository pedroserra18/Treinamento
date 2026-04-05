# Opcao B aplicada: Next.js + API Express separada

## Visao geral

- Web: Next.js na raiz do projeto
- API: Express + TypeScript em /api
- Banco: PostgreSQL via Prisma (proximo passo)

## Como rodar

1. Instalar dependencias da web (raiz):
   npm install
2. Instalar dependencias da API:
   npm --prefix api install
3. Criar arquivo de ambiente da API:
   copy api\\.env.example api\\.env
4. Subir tudo junto:
   npm run dev:full

## Endpoints iniciais

- API health: http://localhost:4000/api/v1/health
- Front web: http://localhost:3000

## Seguranca base ja incluida na API

- Helmet com CSP basica
- CORS restrito por CLIENT_URL
- Rate limit: 100 req/min por IP
- Sanitizacao basica de entrada
- HPP (protege contra HTTP parameter pollution)
- Handler global de erro

## Proximos passos recomendados

1. Prisma + PostgreSQL no /api
2. Cadastro e login JWT
3. OAuth Google
4. Onboarding
5. Motor de recomendacao de treinos
