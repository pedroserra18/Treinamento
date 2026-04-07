import { useMemo, useState } from 'react'

import { useAdminUsers } from '../hooks/useAdminUsers'
import { useAuth } from '../hooks/useAuth'
import { deactivateUserByAdmin, deleteUserByAdmin } from '../services/adminService'

function formatDate(value: string | null): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('pt-BR')
}

export function AdminUsersPage() {
  const { user: authUser, authorizedFetch } = useAuth()
  const [accountScope, setAccountScope] = useState<'REAL' | 'TEST' | 'ALL'>('REAL')
  const [registrationOrder, setRegistrationOrder] = useState<'desc' | 'asc'>('desc')

  const listingOptions = useMemo(
    () => ({
      accountScope,
      includeTest: accountScope !== 'REAL',
      registrationOrder,
    }),
    [accountScope, registrationOrder],
  )

  const { data, loading, error, refresh } = useAdminUsers(1, 50, listingOptions)

  const totalLabel = useMemo(() => {
    if (!data) {
      return '0'
    }

    return String(data.total)
  }, [data])

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h1 className="text-2xl font-black text-[var(--text)]">Usuarios cadastrados</h1>
        <p className="text-sm text-[var(--muted)]">Total de usuarios: {totalLabel}</p>

        {data ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
              Reais: {data.summary.realCount}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">
              Teste: {data.summary.testCount}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">
              Total base: {data.summary.totalCount}
            </span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            Mostrar contas
            <select
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
              value={accountScope}
              onChange={(event) => {
                setAccountScope(event.target.value as 'REAL' | 'TEST' | 'ALL')
              }}
            >
              <option value="REAL">Somente reais</option>
              <option value="TEST">Somente teste</option>
              <option value="ALL">Reais + teste</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            Ordem de cadastro
            <select
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
              value={registrationOrder}
              onChange={(event) => {
                setRegistrationOrder(event.target.value as 'desc' | 'asc')
              }}
            >
              <option value="desc">Mais recentes primeiro</option>
              <option value="asc">Mais antigas primeiro</option>
            </select>
          </label>
        </div>
      </header>

      {loading ? <p className="text-sm text-[var(--muted)]">Carregando usuarios...</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {!loading && !error && data ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Cadastro</th>
                <th className="px-3 py-2">Ultimo login</th>
                <th className="px-3 py-2">Onboarding</th>
                <th className="px-3 py-2">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((listedUser) => (
                <tr key={listedUser.id} className="border-b border-[var(--line)]/70">
                  <td className="px-3 py-2 text-[var(--text)]">{listedUser.name ?? '-'}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{listedUser.email}</td>
                  <td className="px-3 py-2 text-[var(--text)]">
                    {listedUser.accountType === 'TEST' ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-800">
                        Usuario de teste
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
                        Usuario real
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]">{listedUser.role}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{listedUser.status}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{formatDate(listedUser.createdAt)}</td>
                  <td className="px-3 py-2 text-[var(--text)]">{formatDate(listedUser.lastLoginAt)}</td>
                  <td className="px-3 py-2 text-[var(--text)]">
                    {listedUser.onboardingCompletedAt ? 'Completo' : 'Pendente'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]">
                    {listedUser.id === authUser?.id ? (
                      <span className="text-xs text-[var(--muted)]">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {listedUser.status !== 'DISABLED' ? (
                          <button
                            type="button"
                            className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600"
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Deseja desativar a conta de ${listedUser.email}?`,
                              )

                              if (!confirmed) {
                                return
                              }

                              try {
                                await deactivateUserByAdmin(authorizedFetch, listedUser.id)
                                await refresh()
                              } catch (err) {
                                window.alert(
                                  err instanceof Error
                                    ? err.message
                                    : 'Erro ao desativar usuario',
                                )
                              }
                            }}
                          >
                            Desativar conta
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="rounded-lg border border-red-700 px-2 py-1 text-xs font-semibold text-red-700"
                          onClick={async () => {
                            const confirmed = window.confirm(
                              `Deseja excluir a conta de ${listedUser.email}? Esta acao remove a conta da listagem ativa.`,
                            )

                            if (!confirmed) {
                              return
                            }

                            try {
                              await deleteUserByAdmin(authorizedFetch, listedUser.id)
                              await refresh()
                            } catch (err) {
                              window.alert(
                                err instanceof Error
                                  ? err.message
                                  : 'Erro ao excluir usuario',
                              )
                            }
                          }}
                        >
                          Excluir conta
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
