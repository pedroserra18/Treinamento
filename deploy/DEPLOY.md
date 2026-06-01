# Deploy SerraAthlo

Este projeto roda em duas peças:

- **API** (Express + Prisma) → **Render** (free tier OK pra começar)
- **Frontend** (Vite + React) → **Vercel** (free tier confortável)
- **DB + Storage + Realtime** → **Supabase** (já configurado)
- **Cron de reconcile** → **cron-job.org** (free) ou Render Cron (paid)

A primeira vez leva ~30 min de cliques. Depois é só `git push` que tudo se atualiza sozinho.

---

## 1) API → Render (Web Service)

### 1.1 Pré-requisito

O `render.yaml` na raiz do repo já descreve o serviço. Render lê esse arquivo automático quando você "Apply Blueprint".

### 1.2 Passos no painel

1. Acesse https://dashboard.render.com → **Sign up** (login com GitHub é mais simples)
2. No dashboard → **"+ New"** → **"Blueprint"**
3. Conecte sua conta do GitHub → autorize → escolhe o repo `pedroserra18/Treinamento`
4. Render detecta o `render.yaml` automaticamente. Confirma o nome (`acad-api`) e o plano `free`.
5. Aparece uma tela com **todos os env vars** que precisam ser definidos (todos `sync:false`). Para cada um, abre seu `api/.env` local e copia o valor:

   | Variável | De onde tirar |
   |---|---|
   | `DATABASE_URL` | `api/.env` |
   | `DIRECT_URL` | `api/.env` |
   | `JWT_SECRET` | `api/.env` |
   | `JWT_REFRESH_SECRET` | `api/.env` |
   | `GOOGLE_CLIENT_ID` | `api/.env` |
   | `GOOGLE_CLIENT_SECRET` | `api/.env` |
   | `GOOGLE_CALLBACK_URL` | **MUDAR** para `https://<seu-frontend>.vercel.app/auth/google/callback` |
   | `CLIENT_URL` | **MUDAR** para a URL da Vercel (depois do passo 2) |
   | `CORS_ALLOWED_ORIGINS` | **MUDAR** pra URL da Vercel |
   | `SUPABASE_URL` | `api/.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` | `api/.env` |
   | `SUPABASE_STORAGE_BUCKET` | `api/.env` |
   | `RESEND_API_KEY` | `api/.env` |
   | `RESEND_FROM_EMAIL` | `api/.env` |
   | `OPENAI_API_KEY` | `api/.env` |
   | `SENTRY_DSN` | `api/.env` |
   | `CRON_SECRET` | `api/.env` |
   | `REDIS_URL` | **opcional** — deixa vazio se não tem Redis ainda |

6. Clica **"Apply"** — Render começa o build. Demora ~5 min na primeira vez (instala deps, roda `npm run build`, roda `prisma generate`, roda `prisma migrate deploy`).
7. Quando o build termina, anota a URL: algo tipo `https://acad-api.onrender.com`. Essa é sua URL pública da API.

### 1.3 Checagem rápida

Abre no navegador: `https://acad-api.onrender.com/api/v1/health` → deve retornar `200 OK` com um JSON.

---

## 2) Frontend → Vercel

### 2.1 Passos no painel

1. https://vercel.com → **Sign up** com GitHub
2. Dashboard → **"Add New..."** → **"Project"**
3. Importa o repo `pedroserra18/Treinamento`
4. Em **"Root Directory"** seleciona `frontend-vite` (importante — o repo é monorepo)
5. Em **"Framework Preset"** Vercel detecta Vite automaticamente. Confirma.
6. Expande **"Environment Variables"** e adiciona cada uma do `frontend-vite/.env`:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | `https://acad-api.onrender.com/api/v1` (URL do passo 1) |
   | `VITE_SENTRY_DSN` | do `frontend-vite/.env` |
   | `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.2` |
   | `VITE_SUPABASE_URL` | do `frontend-vite/.env` |
   | `VITE_SUPABASE_ANON_KEY` | do `frontend-vite/.env` |
   | `VITE_SUPABASE_TRANSFORM_ENABLED` | `false` |

7. Clica **"Deploy"**. ~2 min.
8. Vercel te dá uma URL tipo `https://treinamento-pedroserra18.vercel.app`. Anota.

### 2.2 Volta no Render e atualiza CLIENT_URL + CORS

1. Render dashboard → seu serviço `acad-api` → **Environment**
2. Edita `CLIENT_URL` → cola a URL da Vercel
3. Edita `CORS_ALLOWED_ORIGINS` → cola a URL da Vercel
4. Edita `GOOGLE_CALLBACK_URL` → `https://<vercel-url>/auth/google/callback`
5. **"Save Changes"** — Render redeploya em ~30s

### 2.3 Atualiza Google OAuth Console

Pra o login com Google funcionar em prod:

1. https://console.cloud.google.com/apis/credentials
2. Edita o OAuth client (mesmo que você usa em dev)
3. Em **"Authorized JavaScript origins"** adiciona a URL da Vercel
4. Em **"Authorized redirect URIs"** adiciona `https://<vercel-url>/auth/google/callback`
5. **Save**

### 2.4 Atualiza Supabase

Pra Storage + Realtime aceitarem chamadas da nova URL:

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL** → URL da Vercel
3. **Redirect URLs** → adiciona `https://<vercel-url>/**`
4. **Save**

---

## 3) Cron job → cron-job.org

A reconciliação de competições expiradas precisa rodar a cada 5 min. Free tier do Render não tem cron, então usamos um scheduler externo (totalmente gratuito).

1. https://cron-job.org → cria conta
2. **Cronjobs** → **Create cronjob**
3. **Title**: `acad reconcile`
4. **URL**: `https://acad-api.onrender.com/api/v1/cron/competition-reconcile`
5. **Schedule** → **Common Schedules** → **Every 5 minutes** (ou cola `*/5 * * * *`)
6. Aba **"Advanced"**:
   - **Request method**: `POST`
   - **Headers** → adiciona:
     - Key: `Authorization`
     - Value: `Bearer <COLA_AQUI_O_CRON_SECRET_DO_api/.env>`
7. **Create**

A cada 5 min ele chama o endpoint, que cancela lobbies expirados e finaliza desafios encerrados.

---

## 4) Smoke test

Abre a URL da Vercel e:

- [ ] Login com email/senha funciona
- [ ] Login com Google funciona (callback redireciona certinho)
- [ ] Cria uma competição
- [ ] Posta uma prova com foto
- [ ] Outro usuário (anônimo / outra conta) reage na prova → você vê em <1s (Realtime)
- [ ] DevTools → Network → WS deve mostrar conexão `wss://...supabase.co/realtime/...` com status 101
- [ ] Erros do frontend chegam no Sentry projeto `acad-web`
- [ ] Erros do backend chegam no Sentry projeto `acad-api`

---

## 5) CI/CD automático (a partir de agora)

A partir desse ponto, **todo push pra `main`**:

- Vercel constrói + deploya o frontend automaticamente
- Render constrói + deploya o backend automaticamente, **rodando `prisma migrate deploy`** antes de subir

Schema changes daqui pra frente:

```powershell
# Em dev local
npm run prisma:migrate:dev --name nome_da_mudanca
# Gera arquivo de migration em prisma/migrations/

# Commit + push
git add prisma/
git commit -m "feat(db): add nome_da_mudanca"
git push

# Render aplica em prod automaticamente no próximo deploy
```

**NUNCA** rode `prisma db push` daqui em diante — só `migrate dev` em dev e `migrate deploy` em prod (que o Render já faz no `start:prod`).

---

## 6) Custos esperados

| Serviço | Free tier | Quando upgradar |
|---|---|---|
| Vercel | Ilimitado pra hobby | Quando passar de 100GB bandwidth/mês ou tiver time |
| Render | API spina down após 15min idle | Quando cold start de 30s incomodar — Starter $7/mo |
| Supabase | 500MB DB, 1GB storage, 200 conn Realtime | Quando passar dos limites — Pro $25/mo |
| cron-job.org | Ilimitado | Nunca pra esse caso de uso |
| Sentry | 5k events/mês | Quando passar disso — Team $26/mo |

**Total começando**: $0/mês até passar dos free tiers.
