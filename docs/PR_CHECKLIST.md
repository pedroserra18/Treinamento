# PR Checklist de Qualidade

## Qualidade tecnica
- [ ] Build web e API passam
- [ ] Typecheck sem erros (`npm run typecheck`)
- [ ] Lint sem erros (`npm run lint`)
- [ ] Codigo formatado (`npm run format:check`)

## Arquitetura e padroes
- [ ] Mudanca respeita separacao web/api
- [ ] Nomes de arquivos e simbolos seguem convencoes
- [ ] Nao ha logica de negocio duplicada

## Seguranca
- [ ] Input validado no backend (Zod/Joi)
- [ ] Nao existe secret hardcoded
- [ ] Middleware de auth aplicado quando necessario
- [ ] Erros nao expoem detalhes sensiveis

## Banco e migracoes
- [ ] Schema Prisma atualizado (se necessario)
- [ ] Migracao incluida e testada
- [ ] Seed atualizado quando houver novo dado base

## Observabilidade
- [ ] Logs relevantes adicionados/ajustados
- [ ] Fluxos criticos possuem tratamento de erro

## UX/UI
- [ ] Tela funcional em mobile e desktop
- [ ] Estados de loading, erro e vazio tratados

## Revisao final
- [ ] PR com descricao clara e objetivo unico
- [ ] Testes novos ou ajuste de testes existentes
- [ ] Documentacao atualizada em `docs/` quando aplicavel
