import { useState } from 'react'
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '../../lib/notifications'

// Linha de "ativar notificações" dentro do popover do timer. Mostra
// estado atual + botão pra pedir permissão. O click no botão é o gesto
// explícito do usuário que o iOS Safari exige pra atender o request.
// Renderiza nada quando o browser não suporta Notification API.
export function NotificationsRow({ onClose }: { onClose: () => void }) {
  const [perm, setPerm] = useState<NotificationPermissionState>(() => getNotificationPermission())
  if (perm === 'unsupported') return null

  return (
    <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
      <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
        Notificação de descanso
      </label>
      <div className="mt-1.5">
        {perm === 'granted' ? (
          <p className="text-[12px] font-semibold text-emerald-500">
            ✓ Ativada — vai vibrar quando o descanso acabar
          </p>
        ) : perm === 'denied' ? (
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Bloqueada. Ative nas configurações do navegador (cadeado na URL → Notificações).
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              const next = await requestNotificationPermission()
              setPerm(next)
              if (next === 'granted') onClose()
            }}
            style={{ touchAction: 'manipulation' }}
            className="w-full rounded-md bg-[var(--brand)] py-1.5 text-[12px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
          >
            Ativar notificações
          </button>
        )}
      </div>
    </div>
  )
}
