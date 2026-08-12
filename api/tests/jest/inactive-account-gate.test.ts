import { inactiveAccountError, type AccountGateState } from "../../src/modules/auth/google-oauth.service";

// Trava o portão que decide quem entra pelo Google.
//
// Contexto: a mensagem antiga ("User account is not active") era única pra
// todos os estados, em inglês e sem saída pro usuário. Ao quebrá-la em
// mensagens específicas, o risco é justamente afrouxar a condição e deixar
// uma conta banida passar. Estes testes existem pra isso não acontecer em
// silêncio.
//
// Teste PURO: a função não toca Prisma nem rede, então roda sem banco. Isso
// é deliberado — a suíte de integração escreve no banco apontado por
// DATABASE_URL, e este arquivo precisa ser seguro de rodar em qualquer
// máquina. Rode só ele com:
//   npx jest --config jest.config.cjs tests/jest/inactive-account-gate.test.ts

const ativo: AccountGateState = { isDeleted: false, status: "ACTIVE" };

describe("inactiveAccountError — quem pode entrar", () => {
  it("libera SOMENTE conta ativa e não excluída", () => {
    expect(inactiveAccountError(ativo)).toBeNull();
  });

  // O teste que mais importa: qualquer estado que não seja exatamente
  // "ativo e não excluído" tem que barrar. Se alguém adicionar um valor ao
  // enum AccountStatus e esquecer de tratar, este caso pega.
  it.each([
    ["excluída", { isDeleted: true, status: "DISABLED" }],
    ["excluída mas ainda marcada ACTIVE", { isDeleted: true, status: "ACTIVE" }],
    ["suspensa", { isDeleted: false, status: "SUSPENDED" }],
    ["desativada", { isDeleted: false, status: "DISABLED" }],
    ["pendente", { isDeleted: false, status: "PENDING" }],
  ] as Array<[string, AccountGateState]>)("bloqueia conta %s", (_rotulo, estado) => {
    const erro = inactiveAccountError(estado);
    expect(erro).not.toBeNull();
    expect(erro?.statusCode).toBe(403);
  });
});

describe("inactiveAccountError — códigos por estado", () => {
  it.each([
    [{ isDeleted: true, status: "DISABLED" }, "ACCOUNT_BANNED"],
    [{ isDeleted: false, status: "SUSPENDED" }, "ACCOUNT_SUSPENDED"],
    [{ isDeleted: false, status: "DISABLED" }, "ACCOUNT_DISABLED"],
    [{ isDeleted: false, status: "PENDING" }, "ACCOUNT_NOT_ACTIVE"],
  ] as Array<[AccountGateState, string]>)("mapeia %o para %s", (estado, codigo) => {
    expect(inactiveAccountError(estado)?.code).toBe(codigo);
  });

  it("exclusão tem precedência sobre o status", () => {
    // Uma conta excluída por admin fica DISABLED + isDeleted. O código
    // precisa refletir a exclusão, que é a informação mais forte.
    expect(inactiveAccountError({ isDeleted: true, status: "SUSPENDED" })?.code).toBe("ACCOUNT_BANNED");
  });
});

describe("inactiveAccountError — não vaza decisão de moderação", () => {
  const bloqueados: AccountGateState[] = [
    { isDeleted: true, status: "DISABLED" },
    { isDeleted: false, status: "SUSPENDED" },
    { isDeleted: false, status: "DISABLED" },
    { isDeleted: false, status: "PENDING" },
  ];

  it("mensagens são em português e sem jargão técnico", () => {
    for (const estado of bloqueados) {
      const msg = inactiveAccountError(estado)!.message;
      expect(msg).toMatch(/^Esta conta/);
      expect(msg).not.toMatch(/user|account is|not active|status|isDeleted/i);
    }
  });

  it("mensagens não citam motivo, data nem quem decidiu", () => {
    for (const estado of bloqueados) {
      const msg = inactiveAccountError(estado)!.message;
      expect(msg).not.toMatch(/\d{2}\/\d{2}|banid|viola|denúnci|spam|admin|moderaç/i);
    }
  });
});
