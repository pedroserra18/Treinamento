# Handoff — continuidade (SerraAthlo / Acad)

> Atualizado em **2026-08-11**. Cole este arquivo (ou aponte pra ele) numa conversa nova.
> **Produção = branch `feat/feed-history-redesign-rpe`** (deploy automático Vercel p/ web
> e Render p/ API), atualmente no commit **`fab45c3`**. A branch _default_ do GitHub é a
> `main`. Convenção: **`main` fica convergida com a `feat`** (mesmo commit) — atualmente
> **sincronizada**. Ao mergear: `git checkout feat` → `git merge --no-ff <branch>` →
> `git branch -f main HEAD` → push das duas.
>
> Mapa de arquivos do projeto: [docs/CODE_MAP.md](docs/CODE_MAP.md). Arquitetura/decisões:
> [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 0. Rodar em outra máquina (setup)

1. Instalar **Git** + **Node 22/24** (+ GitHub CLI: `gh auth login`).
2. `git clone https://github.com/pedroserra18/Treinamento.git && cd Treinamento`
3. `git checkout feat/feed-history-redesign-rpe`
4. Instalar deps em **3 lugares** (não usa workspaces):
   `npm install` · `npm --prefix api install` · `npm --prefix frontend-vite install`
5. **Copiar os 3 `.env` manualmente** (não vão no Git — secrets): `.env` (raiz), `api/.env`,
   `frontend-vite/.env`. Há `.env.example` de cada um mostrando as variáveis.
6. `npm --prefix api run build` (gera Prisma Client; precisa do `api/.env`).
7. `git config user.name/email` + `npm run dev`.

## 1. Estado atual (produção = `feat`, commit `fab45c3`)

**Último trabalho (11/08/2026) — performance de abertura do app.** O PWA travava em
"Validando sessao..." por ~3 min ao voltar do background: o `AuthProvider` bloqueava a
árvore inteira num `GET /auth/profile` sem timeout, com o Render free em cold start. A
sessão passou a ser lida do localStorage de forma síncrona (app pinta no primeiro frame,
validação em background) e todo fetch ganhou timeout. Ver **§2.5.1 do CODE_MAP** pras 3
regras que valem pra qualquer mexida no `AuthContext`. Junto vieram: limpeza dos caches
do usuário no logout (incluindo o treino em andamento), prefetch dos chunks das abas em
idle, e `timeoutMs` explícito nas rotas lentas por natureza (IA e upload). Validado pelo
user no navegador; **falta a validação no PWA do iPhone** (cenário original: treino
aberto → tela travada 20+ min → voltar).

God-files sendo quebrados no padrão: extrair fronteira coesa **verbatim** → validar
(typecheck+lint+testes+build) → conferência visual do user → merge `--no-ff`. **Concluído
até aqui:**

- **AIWorkoutPage** → **123** linhas (era ~2136). 5 levas: telas WELCOME/LOADING/REVIEW/
  RESULT/QUIZ → `pages/ai/*Screen.tsx` + todo o estado/lógica no hook `pages/ai/useAIWorkout.ts`.
  A página virou container fino (chama o hook + roteia telas). **Concluída.**
- **TrainPage** → **367** linhas (era ~3794). **Fase A:** 7 telas extraídas p/ `pages/train/`
  (Recommendations, SendRoutine, NewRoutine, Edit, Dashboard, Summary, Active). **Fase B:**
  todo o estado/efeitos/handlers → hook `pages/train/useTrainSession.ts` (relocação verbatim;
  escolha por análise de risco — o estado cruza domínios, então hook único é mais seguro que
  hooks por domínio). Página = container + roteamento. **Concluída** (o split do hook por
  domínio ficou de fora de propósito: seria não-verbatim no fluxo crítico).
- **WorkoutsPage** → **673** linhas (era 881). Render **totalmente decomposto**: `CreatePlanCard`,
  `PlanHeader`, `ExerciseCard`, `PlanCardioPanel` + `WorkoutPlanModals` (cluster de sheets/modais)
  + `WorkoutPlanCard` (card de 1 rotina), tudo em `pages/workouts/`. Resta ~600 linhas de
  **lógica** (loadAll, drafts, handlers de save) — reduzir mais exigiria hook não-verbatim.
- **ProgressPage** → **715** linhas (era 1189). Abas `exercise` e `body` extraídas p/
  `pages/progress/` (`ProgressExerciseTab` / `ProgressBodyTab`); a página fica com estado +
  header/hero/heatmap + roteamento das 2 abas + os 3 modais (viewer/detalhes/galeria).
- **Docs/organização:** criado `docs/CODE_MAP.md` (mapa de onde cada arquivo mora e como se
  conecta, linkado do README/ARCHITECTURE) + **hook de lembrete no husky pre-commit** (avisa,
  sem bloquear, quando arquivos são add/remove/rename em pages/services/hooks/components/
  api-modules → conferir CODE_MAP).
- Anteriores (rodadas passadas): **AdminUsersPage** → 687 e **ProfilePage** → 624
  (concluídas); **FeedPostCard** → 289; **HomePage** → 634.

## 2. Pendências (retomar aqui)

### ⏳ Próximos god-files (mesmo padrão verbatim, por tamanho)
`ProgressPage` **feita** (abas exercise/body → `pages/progress/`). Maiores intocados agora:
`workoutService.ts` (1162, service — split por sub-domínio) · `account-panels.tsx` (784,
settings) · `CompetitionDetailPage` (740). WorkoutsPage/ProgressPage: só sobra lógica
(extrair hook = não-verbatim, opcional).

## 3. Como rodar / validar

```bash
npm run dev                        # web (Vite, :3000) + API (:4000)
npm run typecheck                  # web + api
npm run lint                       # web + api
npm --prefix frontend-vite test    # Vitest (unit do front) — 181 testes
npm run build:web && npx --prefix frontend-vite vite build   # build de produção do front
npm test                           # Jest integração da API
```

## 4. Gotchas (não esquecer)

- **TESTAR NO LOCALHOST antes de mergear** frontend (produção/CI mascara bug só-de-dev).
- **PWA/Service Worker cacheia tudo** — depois de mudar, **Ctrl+Shift+R**.
- **Commits:** subject minúscula, corpo ≤100 colunas, terminar com `Co-Authored-By: Claude...`.
  Husky roda (na ordem) secret-scan + lembrete-CODE_MAP (não bloqueia) + lint + typecheck no
  pre-commit. `merge:` NÃO é tipo válido no commitlint (usar refactor/fix/chore/docs).
- **Passar mensagem de commit multi-linha:** usar `git commit -F <arquivo>` (o here-string do
  PowerShell `@'...'@` NÃO funciona no Bash e corrompe a mensagem → commitlint rejeita).
- **Padrão de extração de componente:** mover JSX+handlers VERBATIM; só o item/índice/handlers
  viram props; estado fica no pai. Typecheck com `noUnusedLocals` pega import órfão + 0-erro-de-
  prop = rede forte. `.tsx` só exporta componentes (regra react-refresh) → consts/tipos/funções
  puras vão pra um `.ts`. Blocos grandes de render: substituir por script (Python) preservando o
  EOL do arquivo (**CRLF** no repo) evita transcrição manual.
- **Backend (API) → precisa deploy no Render** (não tem auto-deploy garantido). Frontend → Vercel.
- **PowerShell (Win):** sem `&&`; env var inline = `$env:X="true"`.

## 5. Branches

- **`main` sincronizada com a `feat`** (mesmo commit).
- **Faxina feita:** as ~29 branches locais já mergeadas (`refactor/*`, `fix/*`,
  `feat/home-*`) foram apagadas com `git branch -d`. Restam só `feat` e `main` locais.
- Branches remotas antigas de exploração no GitHub (`chore/*`, `feat/avatar-supabase-storage`,
  `dependabot/*`) ainda podem ser limpas lá, se quiser.
