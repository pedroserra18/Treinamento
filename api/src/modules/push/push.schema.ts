import { z } from "zod";

// Schema do POST /push/subscribe — espelha o formato da PushSubscription
// do browser (toJSON()). endpoint é a URL única da push gateway; keys
// contém os segredos de criptografia que o navegador gerou. Tudo é
// armazenado verbatim e usado pelo `web-push` na hora de mandar.
export const subscribePushBodySchema = z
  .object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1)
    }),
    userAgent: z.string().max(255).optional()
  })
  .strict();

export const unsubscribePushBodySchema = z
  .object({
    endpoint: z.string().url()
  })
  .strict();

// Schema do POST /push/schedule. O frontend manda fireAt absoluto (ISO)
// pra não ter ambiguidade de timezone — o backend usa direto na query
// do worker. Tag opcional pra colapsar notificações duplicadas no device
// (ex.: se o user reinicia o descanso, o novo agendamento sobrescreve
// visualmente o anterior).
export const scheduleNotificationBodySchema = z
  .object({
    fireAt: z.string().datetime(),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(280),
    url: z.string().max(500).optional(),
    tag: z.string().max(120).optional()
  })
  .strict();

export const scheduleParamsSchema = z
  .object({
    scheduleId: z.string().cuid()
  })
  .strict();

export type SubscribePushBody = z.infer<typeof subscribePushBodySchema>;
export type UnsubscribePushBody = z.infer<typeof unsubscribePushBodySchema>;
export type ScheduleNotificationBody = z.infer<typeof scheduleNotificationBodySchema>;
export type ScheduleParams = z.infer<typeof scheduleParamsSchema>;
