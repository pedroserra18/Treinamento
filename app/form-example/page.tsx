'use client'

import React, { useState } from 'react'
import {
  Input,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  Switch,
} from '@/components/form'
import type { SelectOption, RadioOption } from '@/types/form'

interface FormValues {
  name: string
  email: string
  category: string
  description: string
  agree: boolean
  notifications: boolean
  plan: string | number
}

interface FormErrors {
  [key: string]: string
}

const selectOptions: SelectOption[] = [
  { value: 'general', label: 'Sugestão Geral' },
  { value: 'bug', label: 'Reportar Bug' },
  { value: 'feature', label: 'Novo Recurso' },
  { value: 'other', label: 'Outro' },
]

const planOptions: RadioOption[] = [
  {
    value: 'free',
    label: 'Gratuito',
    description: 'Acesso limitado com 5 projetos',
  },
  {
    value: 'pro',
    label: 'Profissional',
    description: 'Acesso completo e suporte prioritário',
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    description: 'Solução personalizada com SLA garantido',
  },
]

/**
 * Validação simples de formulário
 */
const validateForm = (values: FormValues): FormErrors => {
  const errors: FormErrors = {}

  if (!values.name.trim()) {
    errors.name = 'Nome é obrigatório'
  } else if (values.name.length < 3) {
    errors.name = 'Nome deve ter pelo menos 3 caracteres'
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!values.email.trim()) {
    errors.email = 'Email é obrigatório'
  } else if (!emailRegex.test(values.email)) {
    errors.email = 'Email inválido'
  }

  if (!values.category) {
    errors.category = 'Categoria é obrigatória'
  }

  if (!values.description.trim()) {
    errors.description = 'Descrição é obrigatória'
  } else if (values.description.length < 10) {
    errors.description = 'Descrição deve ter pelo menos 10 caracteres'
  }

  if (!values.agree) {
    errors.agree = 'Você deve concordar com os termos'
  }

  if (!values.plan) {
    errors.plan = 'Selecione um plano'
  }

  return errors
}

export default function FormExample() {
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    email: '',
    category: '',
    description: '',
    agree: false,
    notifications: true,
    plan: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({})
  const [submitted, setSubmitted] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false)

  const handleChange = (
    field: keyof FormValues,
    value: string | boolean | number
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }))

    // Limpar erro ao mudar o valor
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: '',
      }))
    }
  }

  const handleBlur = (field: string) => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }))
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const newErrors = validateForm(formValues)

    if (Object.keys(newErrors).length === 0) {
      setSubmitted(true)
      console.log('✅ Form submitted:', formValues)
      // Simular envio
      setIsDisabled(true)
      setTimeout(() => {
        alert('Formulário enviado com sucesso!')
        handleReset()
        setIsDisabled(false)
      }, 1500)
    } else {
      setErrors(newErrors)
      console.log('❌ Validation errors:', newErrors)
    }
  }

  const handleReset = () => {
    setFormValues({
      name: '',
      email: '',
      category: '',
      description: '',
      agree: false,
      notifications: true,
      plan: '',
    })
    setErrors({})
    setTouched({})
    setSubmitted(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
            Exemplo de Formulário
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Demonstração completa de todos os componentes de formulário com
            validação
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm p-8 space-y-6"
        >
          {/* Status Messages */}
          {submitted && (
            <div className="alert alert-success">
              ✅ Formulário válido! Pronto para envio.
            </div>
          )}

          {Object.keys(errors).length > 0 && !submitted && (
            <div className="alert alert-danger">
              ❌ Verifique os erros abaixo antes de enviar
            </div>
          )}

          {/* Name Input */}
          <Input
            id="name"
            label="Nome Completo"
            name="name"
            type="text"
            placeholder="João da Silva"
            value={formValues.name}
            onChange={(e) => handleChange('name', e.target.value)}
            onBlur={() => handleBlur('name')}
            error={touched.name ? errors.name : ''}
            helperText="Digite seu nome completo"
            required
            disabled={isDisabled}
          />

          {/* Email Input */}
          <Input
            id="email"
            label="Email"
            name="email"
            type="email"
            placeholder="joao@example.com"
            value={formValues.email}
            onChange={(e) => handleChange('email', e.target.value)}
            onBlur={() => handleBlur('email')}
            error={touched.email ? errors.email : ''}
            helperText="Usaremos este email para contato"
            required
            disabled={isDisabled}
          />

          {/* Category Select */}
          <Select
            id="category"
            label="Categoria"
            name="category"
            value={formValues.category}
            onChange={(e) => handleChange('category', e.target.value)}
            onBlur={() => handleBlur('category')}
            options={selectOptions}
            placeholder="Selecione uma categoria"
            error={touched.category ? errors.category : ''}
            required
            disabled={isDisabled}
          />

          {/* Description Textarea */}
          <Textarea
            id="description"
            label="Descrição Detalhada"
            name="description"
            placeholder="Descreva seu feedback ou sugestão em detalhes..."
            value={formValues.description}
            onChange={(e) => handleChange('description', e.target.value)}
            onBlur={() => handleBlur('description')}
            error={touched.description ? errors.description : ''}
            helperText="Mínimo de 10 caracteres"
            required
            rows={5}
            disabled={isDisabled}
          />

          {/* Plan Selection - RadioGroup */}
          <RadioGroup
            name="plan"
            value={formValues.plan}
            onChange={(value) => handleChange('plan', value)}
            options={planOptions}
            label="Selecione seu Plano"
            error={touched.plan ? errors.plan : ''}
            required
            disabled={isDisabled}
          />

          {/* Notifications Toggle */}
          <Switch
            id="notifications"
            label="Ativar Notificações"
            checked={formValues.notifications}
            onChange={(e) => handleChange('notifications', e.target.checked)}
            description="Receba atualizações sobre seu feedback"
            disabled={isDisabled}
          />

          {/* Agreement Checkbox */}
          <div className="pt-2">
            <Checkbox
              id="agree"
              label="Concordo com os Termos e Condições"
              checked={formValues.agree}
              onChange={(e) => handleChange('agree', e.target.checked)}
              onBlur={() => handleBlur('agree')}
              error={touched.agree ? errors.agree : ''}
              description="Por favor, leia nossos termos antes de concordar"
              disabled={isDisabled}
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="submit"
              disabled={isDisabled}
              className="btn btn-primary flex-1"
            >
              {isDisabled ? 'Enviando...' : 'Enviar Formulário'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={isDisabled}
              className="btn btn-secondary flex-1"
            >
              Limpar
            </button>
          </div>
        </form>

        {/* Info Box */}
        <div className="mt-8 bg-info-50 dark:bg-info-900 border border-info-200 dark:border-info-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-info-800 dark:text-info-200 mb-2">
            📋 Estado Atual do Formulário
          </h3>
          <pre className="text-xs overflow-auto bg-white dark:bg-neutral-950 p-3 rounded border border-info-200 dark:border-info-800 text-neutral-900 dark:text-neutral-50">
            {JSON.stringify(
              {
                values: formValues,
                errors: Object.keys(errors).length > 0 ? errors : 'Nenhum erro',
                submitted,
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>
    </div>
  )
}
