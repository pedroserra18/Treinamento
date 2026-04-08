import { useAuth } from './useAuth'
import { useCallback, useEffect, useState } from 'react'
import type { AdminUsersResponse } from '../types/admin'
import { listUsersForAdmin } from '../services/adminService'

type UseAdminUsersOptions = {
  accountScope?: 'REAL' | 'TEST' | 'ALL'
  includeTest?: boolean
  registrationOrder?: 'asc' | 'desc'
}

export function useAdminUsers(page = 1, pageSize = 20, options: UseAdminUsersOptions = {}) {
  const { authorizedFetch, user } = useAuth()
  const [data, setData] = useState<AdminUsersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    if (user?.role !== 'ADMIN') {
      setData(null)
      setLoading(false)
      setError('Acesso restrito a administradores')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await listUsersForAdmin(authorizedFetch, page, pageSize, options)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuarios')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, options, page, pageSize, user?.role])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  return { data, loading, error, refresh: loadUsers }
}
