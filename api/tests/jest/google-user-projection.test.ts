import { SAFE_USER_SELECT } from "../../src/modules/auth/google-oauth.service";

// Regressão do bug "a foto de perfil some ao reentrar pelo Google".
// Causa raiz: o google-oauth.service tinha um mapper + SELECT próprios,
// divergentes do canônico do auth.service, e o SELECT NÃO trazia avatarUrl
// (nem plan/privacidade/stats). Resultado: o login via Google devolvia um
// usuário incompleto e o cliente perdia a foto.
//
// O fix unificou tudo no mapper canônico (toSafeUser) + neste SAFE_USER_SELECT.
// O TypeScript NÃO protege contra remover um campo daqui (são opcionais na
// entrada do mapper, viram null silenciosamente), por isso este teste trava a
// projeção explicitamente: cada campo do SafeUser precisa estar no SELECT.
describe("Projeção de usuário do login Google (regressão: avatar sumia)", () => {
  const requiredFields = [
    "id",
    "name",
    "handle",
    "email",
    "role",
    "sex",
    "availableDaysPerWeek",
    "birthDate",
    "heightCm",
    "weightKg",
    "experienceLevel",
    "primaryGoal",
    "plan",
    "planExpiresAt",
    "acceptedTermsAt",
    "acceptedTermsVersion",
    "onboardingCompletedAt",
    "isPrivate",
    "showFollowLists",
    "avatarUrl"
  ] as const;

  test.each(requiredFields)("SAFE_USER_SELECT inclui '%s'", (field) => {
    expect(SAFE_USER_SELECT[field]).toBe(true);
  });
});
