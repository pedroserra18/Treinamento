/**
 * Padrão de Formulário Reutilizável
 * Template para criar novos formulários de forma consistente
 */

'use client'

import React from 'react'
import { useForm } from '@/hooks/form'
import { Input, Select } from '@/components/form'

// 1. Definir tipos do formulário
interface MyFormValues {
  username: string
  email: string
  category: string
}

// 2. Definir opções dos selects
const categoryOptions = [
  { value: 'dev', label: 'Desenvolvimento' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Outro' },
]

// 3. Definir função de validação
const validateMyForm = (values: MyFormValues) => {
  const errors: Record<string, string> = {}

  if (!values.username.trim()) {
    errors.username = 'Username é obrigatório'
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(values.email)) {
    errors.email = 'Email inválido'
  }

  if (!values.category) {
    errors.category = 'Selecione uma categoria'
  }

  return errors
}

// 4. Criar componente do formulário
export default function MyFormComponent() {
  const form = useForm<MyFormValues>({
    initialValues: {
      username: '',
      email: '',
      category: '',
    },
    validate: validateMyForm,
    onSubmit: async (values) => {
      console.log('Enviando:', values)
      // Fazer requisição para API
    },
  })

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <Input
        label="Username"
        error={form.getFieldTouched('username') ? form.getFieldError('username') : ''}
        {...form.getFieldProps('username')}
      />

      <Input
        label="Email"
        type="email"
        error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}
        {...form.getFieldProps('email')}
      />

      <Select
        label="Categoria"
        options={categoryOptions}
        value={form.values.category}
        onChange={(e) => form.handleChange('category', e.target.value)}
        error={form.getFieldTouched('category') ? form.getFieldError('category') : ''}
      />

      <button type="submit" disabled={form.isSubmitting} className="btn btn-primary">
        Enviar
      </button>
    </form>
  )
}

/**
 * Padrão Alternativo: Componente Reutilizável com Props
 */

interface FormComponentProps {
  title?: string
  onSuccess?: (values: MyFormValues) => void
}

export function ReusableFormComponent({
  title = 'Meu Formulário',
  onSuccess,
}: FormComponentProps) {
  const form = useForm<MyFormValues>({
    initialValues: {
      username: '',
      email: '',
      category: '',
    },
    validate: validateMyForm,
    onSubmit: async (values) => {
      onSuccess?.(values)
    },
  })

  return (
    <div>
      <h2>{title}</h2>
      <form onSubmit={form.handleSubmit} className="space-y-6">
        {/* Campos aqui */}
        <button type="submit" className="btn btn-primary">
          Enviar
        </button>
      </form>
    </div>
  )
}

/**
 * Padrão com Lógica de Submissão Avançada
 */

export function AdvancedFormComponent() {
  const [successMessage, setSuccessMessage] = React.useState('')

  const form = useForm<MyFormValues>({
    initialValues: {
      username: '',
      email: '',
      category: '',
    },
    validate: validateMyForm,
    onSubmit: async (values) => {
      try {
        // API call
        const response = await fetch('/api/submit', {
          method: 'POST',
          body: JSON.stringify(values),
        })

        if (!response.ok) {
          throw new Error('Erro ao enviar')
        }

        setSuccessMessage('✅ Enviado com sucesso!')
        form.handleReset()

        // Limpar mensagem após 3 segundos
        setTimeout(() => setSuccessMessage(''), 3000)
      } catch (error) {
        console.error('Erro:', error)
        // Mostrar mensagem de erro
      }
    },
  })

  return (
    <form onSubmit={form.handleSubmit}>
      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

      {/* Campos */}

      <button type="submit" disabled={form.isSubmitting} className="btn btn-primary">
        {form.isSubmitting ? 'Enviando...' : 'Enviar'}
      </button>
    </form>
  )
}

/**
 * Padrão com Campo Dinâmico
 */

interface DynamicFormValues extends MyFormValues {
  tags: string[]
}

export function DynamicFormComponent() {
  const form = useForm<DynamicFormValues>({
    initialValues: {
      username: '',
      email: '',
      category: '',
      tags: [],
    },
    validate: (values) => {
      const baseErrors = validateMyForm(values)
      if (values.tags.length === 0) {
        baseErrors.tags = 'Adicione pelo menos uma tag'
      }
      return baseErrors
    },
    onSubmit: async (values) => {
      console.log('Enviando com tags:', values)
    },
  })

  const addTag = (tag: string) => {
    form.setFieldValue('tags', [...form.values.tags, tag])
  }

  const removeTag = (index: number) => {
    form.setFieldValue(
      'tags',
      form.values.tags.filter((_, i) => i !== index)
    )
  }

  return (
    <form onSubmit={form.handleSubmit}>
      {/* Campos normais */}

      {/* Tags dinâmicas */}
      <div>
        <label className="block text-sm font-medium mb-2">Tags</label>
        <div className="flex gap-2 mb-2">
          {form.values.tags.map((tag, index) => (
            <span key={index} className="bg-primary-500 text-white px-3 py-1 rounded">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="ml-2 hover:text-gray-200"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addTag('nova-tag')}
          className="btn btn-secondary text-sm"
        >
          + Adicionar Tag
        </button>
      </div>

      <button type="submit" className="btn btn-primary">
        Enviar
      </button>
    </form>
  )
}
