import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationLink,
  type NotificationItem,
} from '../../services/notificationService'

const POLL_INTERVAL_MS = 60_000
const PANEL_WIDTH = 360
const PANEL_GAP = 8
const VIEWPORT_MARGIN = 12

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

type Position = { top: number; left: number; width: number }

export function NotificationBell() {
  const { isAuthenticated, authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const data = await listNotifications(authorizedFetch)
      setError(null)
      setItems(data.items)
      setUnreadCount(data.unreadCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar notificações')
    }
  }, [authorizedFetch, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isAuthenticated, refresh])

  const computePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)
    let left = rect.right - width
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
    if (left + width > viewportWidth - VIEWPORT_MARGIN) {
      left = viewportWidth - VIEWPORT_MARGIN - width
    }
    const top = rect.bottom + PANEL_GAP
    setPosition({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    computePosition()
    const onScrollOrResize = () => computePosition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleToggle = () => {
    if (!open) void refresh()
    setOpen((prev) => !prev)
  }

  const handleMarkOne = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
    try {
      await markNotificationRead(authorizedFetch, id)
    } catch {
      void refresh()
    }
  }

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.readAt) void handleMarkOne(n.id)
    const link = notificationLink(n)
    setOpen(false)
    if (link) navigate(link)
  }

  const handleMarkAll = async () => {
    if (unreadCount === 0) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnreadCount(0)
    try {
      await markAllNotificationsRead(authorizedFetch)
    } catch {
      void refresh()
    }
  }

  if (!isAuthenticated) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && position ? (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width,
                zIndex: 9999,
              }}
              className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">
                  Notificações
                </h4>
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  disabled={unreadCount === 0}
                  className="text-[11px] font-semibold text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Marcar todas
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden overscroll-contain">
                {error ? (
                  <p className="px-3 py-4 text-center text-xs text-red-400">{error}</p>
                ) : items.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
                    Nenhuma notificação ainda.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)]">
                    {items.map((n) => {
                      const isUnread = !n.readAt
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(n)}
                            className={`flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
                              isUnread ? 'bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isUnread ? (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" />
                              ) : null}
                              <p className="flex-1 truncate text-sm font-bold text-[var(--text)]">
                                {n.title}
                              </p>
                              <span className="shrink-0 text-[10px] text-[var(--muted)]">
                                {timeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs leading-snug text-[var(--muted)]">{n.body}</p>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
