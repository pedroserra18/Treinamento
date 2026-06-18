// Classificação real vs teste por padrão de e-mail. Fonte ÚNICA da verdade —
// usada no signup (email + Google) pra gravar User.accountType, e replicada
// fielmente no backfill da migration 20260618..._add_account_type.
//
// IMPORTANTE: se mudar estes padrões, a classificação de NOVOS cadastros muda,
// mas os já gravados ficam estáveis (é a intenção — não reclassificar a base).

const TEST_EMAIL_SUFFIXES = ["@example.com", "@local.dev"];
const TEST_LOCAL_PART_PREFIXES = [
  "test",
  "teste",
  "qa",
  "mock",
  "demo",
  "seed",
  "tmp",
  "temp",
  "fake",
  "recover",
  "authcheck",
  "logincheck",
  "cadastro.teste",
];
const AUTOMATED_TEST_LOCAL_PART = /^[a-z0-9-]+-\d{10,}(?:-[a-z0-9]{3,8})?$/i;

export function isTestAccountByEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [localPart = ""] = normalized.split("@");

  if (TEST_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (TEST_LOCAL_PART_PREFIXES.some((prefix) => localPart.startsWith(prefix))) return true;
  if (localPart.includes(".teste") || localPart.includes(".test")) return true;
  return AUTOMATED_TEST_LOCAL_PART.test(localPart);
}

export function classifyAccountType(email: string): "REAL" | "TEST" {
  return isTestAccountByEmail(email) ? "TEST" : "REAL";
}
