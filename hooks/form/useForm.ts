/**
 * Hook customizado para gerenciar formulários
 * Fornece estado, validação e manipuladores comuns
 */

import { useState, useCallback, useRef } from 'react'

export interface UseFormOptions<T> {
  initialValues: T
  onSubmit?: (values: T) => void | Promise<void>
  validate?: (values: T) => Record<string, string>
}

export interface UseFormReturn<T> {
  values: T
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  isDirty: boolean

  // Métodos
  handleChange: (
    field: keyof T,
    value: any
  ) => void
  handleBlur: (field: keyof T) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>
  handleReset: () => void
  setFieldValue: (field: keyof T, value: any) => void
  setFieldError: (field: keyof T, error: string) => void
  clearFieldError: (field: keyof T) => void
  clearErrors: () => void
  clearTouched: () => void
  getFieldError: (field: keyof T) => string | undefined
  getFieldTouched: (field: keyof T) => boolean
  getFieldProps: (field: keyof T) => {
    name: string
    value: any
    onChange: (e: any) => void
    onBlur: () => void
  }
}

/**
 * Hook para gerenciar estado e validação de formulários
 * @param options - Configurações do formulário
 * @returns Objeto com valores, erros, métodos e manipuladores
 */
export function useForm<T extends Record<string, any>>({
  initialValues,
  onSubmit,
  validate,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialValuesRef = useRef(initialValues)

  // Verificar se o formulário foi alterado
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValuesRef.current)

  // Atualizar valor de um campo
  const handleChange = useCallback(
    (field: keyof T, value: any) => {
      setValues((prev) => ({
        ...prev,
        [field]: value,
      }))

      // Limpar erro ao mudar o valor
      if (errors[field as string]) {
        setErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[field as string]
          return newErrors
        })
      }
    },
    [errors]
  )

  // Marcar campo como tocado
  const handleBlur = useCallback((field: keyof T) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }))
  }, [])

  // Submeter formulário
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      // Validar se função de validação foi fornecida
      if (validate) {
        const newErrors = validate(values)

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors)
          // Marcar todos os campos como tocados ao enviar
          const allTouched = Object.keys(values).reduce(
            (acc, key) => ({
              ...acc,
              [key]: true,
            }),
            {}
          )
          setTouched(allTouched)
          return
        }
      }

      // Marcar como enviando
      setIsSubmitting(true)

      try {
        // Chamar onSubmit se fornecido
        if (onSubmit) {
          await onSubmit(values)
        }
      } catch (error) {
        console.error('Form submission error:', error)
      } finally {
        setIsSubmitting(false)
      }
    },
    [values, validate, onSubmit]
  )

  // Resetar formulário
  const handleReset = useCallback(() => {
    setValues(initialValuesRef.current)
    setErrors({})
    setTouched({})
  }, [])

  // Definir valor de um campo diretamente
  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  // Definir erro de um campo
  const setFieldError = useCallback(
    (field: keyof T, error: string) => {
      setErrors((prev) => ({
        ...prev,
        [field as string]: error,
      }))
    },
    []
  )

  // Limpar erro de um campo
  const clearFieldError = useCallback((field: keyof T) => {
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[field as string]
      return newErrors
    })
  }, [])

  // Limpar todos os erros
  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  // Limpar campos tocados
  const clearTouched = useCallback(() => {
    setTouched({})
  }, [])

  // Obter erro de um campo
  const getFieldError = useCallback(
    (field: keyof T): string | undefined => {
      return errors[field as string]
    },
    [errors]
  )

  // Verificar se um campo foi tocado
  const getFieldTouched = useCallback(
    (field: keyof T): boolean => {
      return touched[field as string] || false
    },
    [touched]
  )

  // Helper para obter props do campo (input)
  const getFieldProps = useCallback(
    (field: keyof T) => {
      const fieldValue = values[field]

      // Detectar tipo de valor para manipular checkbox/radio/select
      const isCheckbox =
        typeof fieldValue === 'boolean' &&
        field.toString().toLowerCase().includes('check')

      return {
        name: String(field),
        value: isCheckbox ? undefined : fieldValue,
        checked: isCheckbox ? fieldValue : undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
          const target = e.target as any
          const value = target.type === 'checkbox' ? target.checked : target.value
          handleChange(field, value)
        },
        onBlur: () => handleBlur(field),
      }
    },
    [values, handleChange, handleBlur]
  )

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,
    handleChange,
    handleBlur,
    handleSubmit,
    handleReset,
    setFieldValue,
    setFieldError,
    clearFieldError,
    clearErrors,
    clearTouched,
    getFieldError,
    getFieldTouched,
    getFieldProps,
  }
}

/**
 * Hook para gerenciar um único campo de formulário
 */
export function useFormField(initialValue: any = '') {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)

  const handleChange = useCallback((newValue: any) => {
    setValue(newValue)
    if (error) setError('')
  }, [error])

  const handleBlur = useCallback(() => {
    setTouched(true)
  }, [])

  const reset = useCallback(() => {
    setValue(initialValue)
    setError('')
    setTouched(false)
  }, [initialValue])

  return {
    value,
    error,
    touched,
    setValue,
    setError,
    handleChange,
    handleBlur,
    reset,
  }
}
