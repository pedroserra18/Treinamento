import { createContext } from 'react'

export type ShowLimitDialog = (feature: string, current: number, limit: number) => void

export const PlanLimitContext = createContext<ShowLimitDialog | null>(null)
