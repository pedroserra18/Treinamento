# Handoff — continuidade (SerraAthlo / Acad)

> Atualizado em **2026-07-21**. Cole este arquivo (ou aponte pra ele) numa conversa nova.
> **Produção = branch `feat/feed-history-redesign-rpe`** (deploy automático Vercel p/ web
> e Render p/ API). **`main` fica sempre convergida com a `feat`** (mesmo commit) — a
> branch _default_ do GitHub é a `main`. Ao mergear: `git checkout feat` → `git merge --no-ff <branch>`
> → `git branch -f main HEAD` → push das duas.

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

## 1. Estado atual (produção = `feat` + `main` = commit `324813e`)

God-files sendo quebrados no padrão: extrair fronteira coesa → validar (typecheck+lint+testes+build)
→ conferência visual do user → merge. **Feito nesta rodada:**

- **AIWorkoutPage** 3140→2136 (3 levas: helpers, métricas do Resumo, componentes). Mergeada.
- **TrainPage** 4625→3784: Fase 2 do reducer (resumo/pós-treino) + 5 componentes extraídos
  (ActiveExerciseCard ~450 linhas, RoutineCard, SummaryShareActions, SummaryPhotoPicker,
  ActiveWorkoutMenu). Todos mergeados e conferidos.
- **WorkoutsPage** 1605→1336: helpers puros (workouts-utils.ts) + PlanCardioPanel. Mergeados.
- **cspell.json** (commit `e7a817b`): corretor do VSCode marcava toda palavra PT como "erro"
  (~714). Adicionados dicionários `@cspell/dict-pt-br`/`-pt` (devDeps) + termos de domínio →
  caiu p/ ~24 (palavrões do filtro + typos reais). Zero impacto no app.
- **AdminUsersPage** 1386→1268: **Leva 1** (helpers puros → admin/admin-users-utils.ts + testes).
  Mergeada (`3383662`).
- **AdminUsersPage** **Leva 2** (kit de UI → admin/admin-users-ui.tsx) 1268→1105. Mergeada.
- **AdminUsersPage** **Leva 3** (ConfirmModal + UserDrawer → arquivos próprios em admin/) 1105→687.
  Mergeada. **AdminUsersPage concluída.**
- **ProfilePage** 891→624 (UserListModal, CalendarPanel, profile-utils +10 testes → profile/).
  Mergeada.

## 2. Pendências (retomar aqui)

### ⏳ A. Outras páginas grandes (por tamanho, mesmo padrão)
WorkoutsPage (1336, main acoplado), FeedPostCard (1191, componente crítico do feed),
HomePage (916). AIWorkoutPage (2136, resta o quiz stateful — mais arriscado).
TrainPage (3784): render já enxuto; o que resta é a seção de lógica (custom hooks = mais arriscado).
AdminUsersPage (687) e ProfilePage (624): **concluídas**.

## 3. Como rodar / validar

```bash
npm run dev                        # web (Vite) + API (4000)
npm run typecheck                  # web + api
npm run lint                       # web + api
npm --prefix frontend-vite test    # Vitest (unit do front) — 118 testes
npm test                           # Jest integração da API (1 teste é flaky, re-rodar)
```

## 4. Gotchas (não esquecer)

- **TESTAR NO LOCALHOST antes de mergear** frontend (produção/CI mascara bug só-de-dev).
- **PWA/Service Worker cacheia tudo** — depois de mudar, **Ctrl+Shift+R**.
- **Commits:** subject minúscula, corpo ≤100 colunas, terminar com `Co-Authored-By: Claude...`.
  Husky roda lint+typecheck no pre-commit. `merge:` NÃO é tipo válido (usar refactor/fix/chore).
- **Backend (API) → precisa deploy no Render** (não tem auto-deploy garantido). Frontend → Vercel sozinho.
- **Padrão de extração de componente:** mover JSX+handlers VERBATIM; só o item/índice/handlers viram
  props; estado fica no pai. Typecheck pega 0-erro-de-prop = rede forte. `.tsx` só exporta
  componentes (regra react-refresh) → consts/tipos/funções puras vão pra um `.ts`.
- **PowerShell (Win):** sem `&&`; env var inline = `$env:X="true"`.

## 5. Branches abertas
- Nenhuma pendente. As de refactor recentes (`refactor/admin-users-ui`,
  `refactor/admin-users-drawer`, `refactor/profile-page`) já foram mergeadas na feat+main —
  podem ser limpas.
- Várias antigas de exploração (chore/*, feat/avatar-supabase-storage, etc.) — podem ser limpas.
