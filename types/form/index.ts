import { ReactNode } from 'react'

/**
 * Estados possíveis para campos de formulário
 */
export type FormFieldState = 'default' | 'focus' | 'error' | 'disabled' | 'success'

/**
 * Props base para todos os campos de formulário
 */
export interface BaseInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label do campo */
  label?: string
  /** Mensagem de erro */
  error?: string
  /** Texto de ajuda abaixo do campo */
  helperText?: string
  /** Se é obrigatório */
  required?: boolean
  /** Ícone à esquerda do campo */
  icon?: ReactNode
  /** Classes customizadas */
  containerClassName?: string
  /** Mostrar asterisco de obrigatório */
  showRequired?: boolean
}

/**
 * Props para Textarea
 */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  containerClassName?: string
  showRequired?: boolean
}

/**
 * Props para Select
 */
export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
  options: SelectOption[]
  placeholder?: string
  containerClassName?: string
  showRequired?: boolean
}

/**
 * Props para Checkbox
 */
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  containerClassName?: string
  description?: string
}

/**
 * Props para Radio
 */
export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  helperText?: string
  containerClassName?: string
  description?: string
}

/**
 * Props para RadioGroup
 */
export interface RadioOption {
  value: string | number
  label: string
  description?: string
  disabled?: boolean
}

export interface RadioGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  name: string
  value?: string | number
  options: RadioOption[]
  onChange?: (value: string | number) => void
  error?: string
  helperText?: string
  label?: string
  disabled?: boolean
  containerClassName?: string
  showRequired?: boolean
  required?: boolean
}

/**
 * Props para Switch
 */
export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
  error?: string
  containerClassName?: string
  switchClassName?: string
}

/**
 * Props para FormFieldWrapper
 */
export interface FormFieldWrapperProps {
  /** ID do campo para associar com label */
  id?: string
  /** Label do campo */
  label?: string
  /** Mensagem de erro */
  error?: string
  /** Texto de ajuda */
  helperText?: string
  /** Mostrar asterisco de obrigatório */
  required?: boolean
  /** Mostrar asterisco */
  showRequired?: boolean
  /** Conteúdo do campo */
  children: ReactNode
  /** Classes customizadas do container */
  className?: string
}

/**
 * Hook de validação de formulário
 */
export interface ValidationRule {
  validate: (value: any) => boolean
  message: string
}

export interface UseFormFieldOptions {
  initialValue?: any
  rules?: Record<string, ValidationRule[]>
  onError?: (fieldName: string, error: string) => void
}
