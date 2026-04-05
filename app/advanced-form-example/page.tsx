'use client'

import React from 'react'
import { useForm } from '@/hooks/form'
import { Input, Select, Textarea, Checkbox, RadioGroup } from '@/components/form'
import type { SelectOption, RadioOption } from '@/types/form'

interface AdvancedFormValues {
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  bio: string
  newsletter: boolean
  accountType: string | number
}

const countryOptions: SelectOption[] = [
  { value: 'br', label: 'Brasil' },
  { value: 'us', label: 'Estados Unidos' },
  { value: 'mx', label: 'México' },
  { value: 'ar', label: 'Argentina' },
  { value: 'other', label: 'Outro' },
]

const accountTypeOptions: RadioOption[] = [
  { value: 'personal', label: 'Pessoal', description: 'Para uso individual' },
  { value: 'business', label: 'Empresa', description: 'Para negócios' },
  { value: 'developer', label: 'Desenvolvedor', description: 'API e integrações' },
]

const validateAdvancedForm = (values: AdvancedFormValues) => {
  const errors: Record<string, string> = {}

  // Validar primeiro nome
  if (!values.firstName.trim()) {
    errors.firstName = 'Primeiro nome é obrigatório'
  } else if (values.firstName.length < 2) {
    errors.firstName = 'Deve ter pelo menos 2 caracteres'
  }

  // Validar sobrenome
  if (!values.lastName.trim()) {
    errors.lastName = 'Sobrenome é obrigatório'
  }

  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!values.email.trim()) {
    errors.email = 'Email é obrigatório'
  } else if (!emailRegex.test(values.email)) {
    errors.email = 'Email inválido'
  }

  // Validar telefone (opcional mas se preenchido deve ser válido)
  if (values.phone && values.phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Telefone inválido'
  }

  // Validar país
  if (!values.country) {
    errors.country = 'Selecione um país'
  }

  // Validar bio
  if (!values.bio.trim()) {
    errors.bio = 'Biografia é obrigatória'
  } else if (values.bio.length < 20) {
    errors.bio = 'Deve ter pelo menos 20 caracteres'
  }

  // Validar tipo de conta
  if (!values.accountType) {
    errors.accountType = 'Selecione um tipo de conta'
  }

  return errors
}

export default function AdvancedFormExample() {
  const form = useForm<AdvancedFormValues>({
    initialValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      country: '',
      bio: '',
      newsletter: true,
      accountType: '',
    },
    validate: validateAdvancedForm,
    onSubmit: async (values) => {
      // Simular requisição
      console.log('📤 Enviando dados:', values)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      alert('✅ Usuário criado com sucesso!')
      form.handleReset()
    },
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-950 dark:to-neutral-900 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-3">
            Criar Conta
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-lg">
            Usando o hook <code className="bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded font-mono text-sm">useForm</code> para gerenciamento avançado
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={form.handleSubmit}
          className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg p-8 space-y-6"
        >
          {/* Status */}
          {form.isDirty && (
            <div className="alert alert-info">
              🔄 Você tem alterações não salvas
            </div>
          )}

          {Object.keys(form.errors).length > 0 && form.isDirty && (
            <div className="alert alert-danger">
              ❌ Verifique os erros abaixo
            </div>
          )}

          {/* Row 1: Nome e Sobrenome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              id="firstName"
              label="Primeiro Nome"
              placeholder="João"
              error={
                form.getFieldTouched('firstName')
                  ? form.getFieldError('firstName')
                  : ''
              }
              {...form.getFieldProps('firstName')}
              required
              disabled={form.isSubmitting}
            />
            <Input
              id="lastName"
              label="Sobrenome"
              placeholder="Silva"
              error={
                form.getFieldTouched('lastName')
                  ? form.getFieldError('lastName')
                  : ''
              }
              {...form.getFieldProps('lastName')}
              required
              disabled={form.isSubmitting}
            />
          </div>

          {/* Row 2: Email e Telefone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="joao@example.com"
              error={
                form.getFieldTouched('email')
                  ? form.getFieldError('email')
                  : ''
              }
              helperText="Usaremos para confirmar sua conta"
              {...form.getFieldProps('email')}
              required
              disabled={form.isSubmitting}
            />
            <Input
              id="phone"
              label="Telefone (opcional)"
              type="tel"
              placeholder="(11) 98765-4321"
              error={
                form.getFieldTouched('phone')
                  ? form.getFieldError('phone')
                  : ''
              }
              {...form.getFieldProps('phone')}
              disabled={form.isSubmitting}
            />
          </div>

          {/* Country Select */}
          <Select
            id="country"
            label="País"
            options={countryOptions}
            placeholder="Selecione seu país"
            error={
              form.getFieldTouched('country')
                ? form.getFieldError('country')
                : ''
            }
            value={form.values.country}
            onChange={(e) => {
              form.handleChange('country', e.target.value)
            }}
            onBlur={() => form.handleBlur('country')}
            required
            disabled={form.isSubmitting}
          />

          {/* Bio Textarea */}
          <Textarea
            id="bio"
            label="Sobre Você"
            placeholder="Conte um pouco sobre você..."
            error={
              form.getFieldTouched('bio') ? form.getFieldError('bio') : ''
            }
            helperText="Mínimo de 20 caracteres"
            value={form.values.bio}
            onChange={(e) => {
              form.handleChange('bio', e.target.value)
            }}
            onBlur={() => form.handleBlur('bio')}
            rows={4}
            required
            disabled={form.isSubmitting}
          />

          {/* Account Type */}
          <RadioGroup
            name="accountType"
            value={form.values.accountType}
            onChange={(value) => form.handleChange('accountType', value)}
            options={accountTypeOptions}
            label="Tipo de Conta"
            error={
              form.getFieldTouched('accountType')
                ? form.getFieldError('accountType')
                : ''
            }
            required
            disabled={form.isSubmitting}
          />

          {/* Newsletter */}
          <div className="flex items-center gap-3 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <input
              type="checkbox"
              id="newsletter"
              checked={form.values.newsletter}
              onChange={(e) => {
                form.handleChange('newsletter', e.target.checked)
              }}
              className="w-5 h-5 rounded accent-primary-500"
            />
            <label
              htmlFor="newsletter"
              className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
            >
              Desejo receber emails sobre novidades e atualizações
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="submit"
              disabled={form.isSubmitting}
              className="btn btn-primary flex-1"
            >
              {form.isSubmitting ? '⏳ Criando...' : '✅ Criar Conta'}
            </button>
            <button
              type="button"
              onClick={form.handleReset}
              disabled={form.isSubmitting}
              className="btn btn-secondary flex-1"
            >
              🔄 Resetar
            </button>
          </div>
        </form>

        {/* Debug Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* State */}
          <div className="bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-primary-800 dark:text-primary-200 mb-3">
              📊 Estado do Formulário
            </h3>
            <div className="space-y-2 text-xs text-primary-800 dark:text-primary-200">
              <p>✓ Dirty: {form.isDirty ? '✅ Sim' : '❌ Não'}</p>
              <p>✓ Submitting: {form.isSubmitting ? '✅ Sim' : '❌ Não'}</p>
              <p>✓ Erros: {Object.keys(form.errors).length}</p>
              <p>✓ Campos tocados: {Object.keys(form.touched).length}</p>
            </div>
          </div>

          {/* Errors */}
          <div className="bg-danger-50 dark:bg-danger-900 border border-danger-200 dark:border-danger-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-danger-800 dark:text-danger-200 mb-3">
              🔍 Erros de Validação
            </h3>
            {Object.keys(form.errors).length > 0 ? (
              <ul className="space-y-1 text-xs text-danger-800 dark:text-danger-200">
                {Object.entries(form.errors).map(([field, error]) => (
                  <li key={field}>
                    • <span className="font-medium">{field}:</span> {error}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-danger-700 dark:text-danger-300">
                Nenhum erro
              </p>
            )}
          </div>
        </div>

        {/* JSON Output */}
        <div className="mt-6 bg-neutral-900 dark:bg-black rounded-lg p-4 overflow-auto">
          <h3 className="text-sm font-semibold text-neutral-400 mb-3">
            💾 Dados do Formulário (JSON)
          </h3>
          <pre className="text-xs text-green-400 font-mono">
            {JSON.stringify(form.values, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
