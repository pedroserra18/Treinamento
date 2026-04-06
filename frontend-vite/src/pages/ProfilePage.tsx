import { useAuth } from '../hooks/useAuth'

export function ProfilePage() {
  const { user, logout } = useAuth()

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h1 className="text-2xl font-extrabold text-[var(--text)]">Perfil</h1>

      <div className="space-y-1 text-sm text-[var(--muted)]">
        <p>
          <span className="font-semibold text-[var(--text)]">Nome:</span> {user?.name ?? '-'}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Email:</span> {user?.email ?? '-'}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Role:</span> {user?.role ?? '-'}
        </p>
      </div>

      <button
        onClick={() => void logout()}
        type="button"
        className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-600"
      >
        Logout seguro
      </button>
    </section>
  )
}
