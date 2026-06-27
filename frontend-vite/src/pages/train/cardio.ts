import type { CardioType } from '../../types/workout'

// Rótulos PT-BR e ordem dos tipos de cardio. Compartilhado entre o TrainPage
// (resumo) e o CardioSection (mini-form do treino ativo).
export const CARDIO_LABELS: Record<CardioType, string> = {
  WALK: 'Caminhada', RUN: 'Corrida', BIKE: 'Bicicleta', STAIRS: 'Escada',
  ELLIPTICAL: 'Elíptico', ROW: 'Remo', JUMP_ROPE: 'Corda', SWIM: 'Natação', OTHER: 'Outro',
}
export const CARDIO_TYPES = Object.keys(CARDIO_LABELS) as CardioType[]
