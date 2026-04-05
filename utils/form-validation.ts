/**
 * Funções utilitárias para formulários
 * Validação, formatação e operações comuns
 */

/**
 * Valida um email
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Valida um telefone (formato brasileiro)
 */
export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^(\d{10,11})$/
  const cleaned = phone.replace(/\D/g, '')
  return phoneRegex.test(cleaned)
}

/**
 * Valida um CPF (formato brasileiro)
 */
export const validateCPF = (cpf: string): boolean => {
  const cleaned = cpf.replace(/\D/g, '')

  if (cleaned.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cleaned)) return false

  let sum = 0
  let remainder

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i)
  }

  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleaned.substring(9, 10))) return false

  sum = 0
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i)
  }

  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleaned.substring(10, 11))) return false

  return true
}

/**
 * Formata um CPF
 */
export const formatCPF = (cpf: string): string => {
  const cleaned = cpf.replace(/\D/g, '')
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/**
 * Formata um telefone
 */
export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  } else if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  return phone
}

/**
 * Remove máscara de um valor
 */
export const unmask = (value: string): string => {
  return value.replace(/\D/g, '')
}

/**
 * Valida um campo obrigatório
 */
export const validateRequired = (value: any): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (typeof value === 'boolean') {
    return value === true
  }
  return value !== null && value !== undefined
}

/**
 * Valida tamanho mínimo
 */
export const validateMinLength = (value: string, minLength: number): boolean => {
  return value.length >= minLength
}

/**
 * Valida tamanho máximo
 */
export const validateMaxLength = (value: string, maxLength: number): boolean => {
  return value.length <= maxLength
}

/**
 * Valida uma URL
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Valida um padrão customizado
 */
export const validatePattern = (value: string, pattern: RegExp): boolean => {
  return pattern.test(value)
}

/**
 * Hook customizado para validação de formulários
 * Retorna um objeto com métodos para validação e gerenciamento de erros
 */
export interface FormFieldValidation {
  field: string
  rules: ValidationRule[]
}

export interface ValidationRule {
  validate: (value: any) => boolean
  message: string
}

export const createFieldValidator = (
  validations: FormFieldValidation[]
) => {
  return (formValues: Record<string, any>): Record<string, string> => {
    const errors: Record<string, string> = {}

    validations.forEach(({ field, rules }) => {
      for (const rule of rules) {
        if (!rule.validate(formValues[field])) {
          errors[field] = rule.message
          break // Para no primeiro erro
        }
      }
    })

    return errors
  }
}

/**
 * Combina múltiplas validações em uma
 */
export const combineValidators =
  (...validators: ((value: any) => boolean)[]) =>
  (value: any): boolean => {
    return validators.every((validator) => validator(value))
  }

/**
 * Cria um validador de campo reusável
 */
export const createFieldError = (
  field: string,
  message: string
): Record<string, string> => {
  return { [field]: message }
}
