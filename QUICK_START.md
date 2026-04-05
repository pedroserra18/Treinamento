# ⚡ Quick Start - Sistema de Formulários

Guia rápido para começar a usar o sistema de componentes de formulários.

---

## 🚀 Iniciar o Projeto

```bash
# Instalar dependências (já feito!)
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Abrir no navegador
# http://localhost:3000/form-example
# http://localhost:3000/advanced-form-example
```

---

## 📝 Usar em seu Componente

### Exemplo Mínimo

```tsx
import { Input, Button } from '@/components/form'
import { useForm } from '@/hooks/form'

export default function MyForm() {
  const form = useForm({
    initialValues: { email: '', name: '' },
    validate: (values) => {
      const errors: Record<string, string> = {}
      if (!values.email) errors.email = 'Email obrigatório'
      return errors
    },
    onSubmit: async (values) => {
      console.log('Enviando:', values)
    },
  })

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <Input
        label="Email"
        placeholder="seu@email.com"
        error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}
        {...form.getFieldProps('email')}
        required
      />

      <button type="submit" className="btn btn-primary">
        Enviar
      </button>
    </form>
  )
}
```

---

## 🎯 Componentes Disponíveis

### 1. Input

```tsx
import { Input } from '@/components/form'

<Input
  label="Nome"
  placeholder="Digite seu nome"
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  error={error}
  helperText="Nome completo"
  required
/>
```

### 2. Textarea

```tsx
import { Textarea } from '@/components/form'

<Textarea
  label="Mensagem"
  placeholder="Digite sua mensagem..."
  rows={5}
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

### 3. Select

```tsx
import { Select } from '@/components/form'
import type { SelectOption } from '@/components/form'

const options: SelectOption[] = [
  { value: '1', label: 'Opção 1' },
  { value: '2', label: 'Opção 2' },
]

<Select
  label="Escolha"
  options={options}
  placeholder="Selecione..."
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
/>
```

### 4. Checkbox

```tsx
import { Checkbox } from '@/components/form'

<Checkbox
  label="Concordo com os termos"
  checked={agreed}
  onChange={(e) => setAgreed(e.target.checked)}
/>
```

### 5. RadioGroup

```tsx
import { RadioGroup } from '@/components/form'
import type { RadioOption } from '@/components/form'

const options: RadioOption[] = [
  { value: 'opt1', label: 'Opção 1' },
  { value: 'opt2', label: 'Opção 2' },
]

<RadioGroup
  name="choice"
  value={selected}
  onChange={(value) => setSelected(value)}
  options={options}
  label="Escolha uma opção"
/>
```

### 6. Switch

```tsx
import { Switch } from '@/components/form'

<Switch
  label="Notificações"
  checked={enabled}
  onChange={(e) => setEnabled(e.target.checked)}
/>
```

---

## 🔨 Usar o Hook useForm

O hook `useForm` gerencia todo o estado e validação do formulário!

```tsx
import { useForm } from '@/hooks/form'

const form = useForm({
  // 1. Valores iniciais
  initialValues: {
    email: '',
    password: '',
    remember: false,
  },

  // 2. Função de validação
  validate: (values) => {
    const errors: Record<string, string> = {}

    if (!values.email) {
      errors.email = 'Email é obrigatório'
    } else if (!validateEmail(values.email)) {
      errors.email = 'Email inválido'
    }

    if (!values.password) {
      errors.password = 'Senha é obrigatória'
    } else if (values.password.length < 8) {
      errors.password = 'Mínimo 8 caracteres'
    }

    return errors
  },

  // 3. Callback ao enviar
  onSubmit: async (values) => {
    // Enviar para API
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(values),
    })

    if (response.ok) {
      form.handleReset() // Limpar formulário
    }
  },
})
```

### Propriedades do Form

```tsx
form.values          // { email: '', password: '', ... }
form.errors          // { email: 'Error message', ... }
form.touched         // { email: true, password: true, ... }
form.isSubmitting    // boolean - está enviando?
form.isDirty         // boolean - foi alterado?
```

### Métodos do Form

```tsx
// Manipuladores de evento
form.handleChange('email', 'novo@valor.com')
form.handleBlur('email')
form.handleSubmit(e)  // e: Submissão do form
form.handleReset()

// Métodos auxiliares
form.setFieldValue('email', 'novo@valor.com')
form.setFieldError('email', 'Erro customizado')
form.clearFieldError('email')
form.clearErrors()
form.clearTouched()

// Getters
form.getFieldError('email')      // 'Erro' | undefined
form.getFieldTouched('email')    // boolean
form.getFieldProps('email')      // { name, value, onChange, onBlur }
```

### Helper getFieldProps

Simplifica muito a escrita:

```tsx
// ❌ Verboso
<Input
  name="email"
  value={form.values.email}
  onChange={(e) => form.handleChange('email', e.target.value)}
  onBlur={() => form.handleBlur('email')}
  error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}
/>

// ✅ Simples
<Input
  label="Email"
  error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}
  {...form.getFieldProps('email')}
/>
```

---

## 🎨 Usando o Sistema de Cores

Cores semânticas configuradas no Tailwind:

```tsx
// Colors
<div className="text-primary-500">Azul</div>
<div className="text-success-500">Verde</div>
<div className="text-danger-500">Vermelho</div>
<div className="text-warning-500">Âmbar</div>

// Background
<div className="bg-primary-100">Light Blue</div>
<div className="bg-danger-600">Dark Red</div>

// Variações (50-900)
primary-50   // Muito claro
primary-100
primary-200
...
primary-900  // Muito escuro
```

---

## ✅ Validação Custom

### Usando Utilitários

```tsx
import { validateEmail, validatePhone } from '@/utils/form-validation'

const form = useForm({
  validate: (values) => {
    const errors: Record<string, string> = {}

    if (!validateEmail(values.email)) {
      errors.email = 'Email inválido'
    }

    if (!validatePhone(values.phone)) {
      errors.phone = 'Telefone inválido'
    }

    return errors
  },
})
```

### Validadores Disponíveis

```tsx
validateRequired(value)              // Não vazio
validateEmail(email)                 // Email válido
validatePhone(phone)                 // Telefone válido
validateCPF(cpf)                    // CPF válido
validateUrl(url)                    // URL válida
validatePattern(value, regex)       // Regex customizado
validateMinLength(value, length)    // Comprimento mínimo
validateMaxLength(value, length)    // Comprimento máximo
```

### Formatadores Disponíveis

```tsx
import { formatCPF, formatPhone } from '@/utils/form-validation'

// Formatar valores
const cpfFormatado = formatCPF('12345678900')
const phoneFormatado = formatPhone('11987654321')
```

---

## 🌙 Dark Mode

Automático! Usa o atributo `dark:` do Tailwind:

```tsx
// Claro: bg-white
// Escuro: bg-neutral-900
<div className="bg-white dark:bg-neutral-900">
```

Para ativar dark mode:

```tsx
// Em app/layout.tsx
document.documentElement.classList.add('dark')

// Ou use next-themes (já pode instalar)
import { ThemeProvider } from 'next-themes'
```

---

## 📱 Responsivo

Todos os componentes são responsivos!

```tsx
// Grid responsivo
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <Input label="Campo 1" {...props} />
  <Input label="Campo 2" {...props} />
</div>

// Classes úteis
<div className="flex-center">              {/* Centralizado */}
<div className="flex-between">            {/* Space-between */}
<div className="container-filled">        {/* Container com padding */}
```

---

##  Estrutura de um Formulário Completo

```tsx
'use client'

import { useForm } from '@/hooks/form'
import { Input, Select, Checkbox } from '@/components/form'
import type { SelectOption } from '@/components/form'

// Tipos
interface MyFormValues {
  name: string
  email: string
  category: string
  agreed: boolean
}

// Opções
const categories: SelectOption[] = [
  { value: 'dev', label: 'Desenvolvimento' },
  { value: 'design', label: 'Design' },
]

// Validação
const validateForm = (values: MyFormValues) => {
  const errors: Record<string, string> = {}

  if (!values.name.trim()) {
    errors.name = 'Nome é obrigatório'
  }

  if (!values.email.includes('@')) {
    errors.email = 'Email inválido'
  }

  if (!values.agreed) {
    errors.agreed = 'Você deve concordar'
  }

  return errors
}

// Componente
export default function MyForm() {
  const form = useForm<MyFormValues>({
    initialValues: {
      name: '',
      email: '',
      category: '',
      agreed: false,
    },
    validate: validateForm,
    onSubmit: async (values) => {
      console.log('Enviando:', values)
      alert('Sucesso!')
    },
  })

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <Input
        label="Nome"
        error={form.getFieldTouched('name') ? form.getFieldError('name') : ''}
        {...form.getFieldProps('name')}
        required
      />

      <Input
        type="email"
        label="Email"
        error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}
        {...form.getFieldProps('email')}
        required
      />

      <Select
        label="Categoria"
        options={categories}
        value={form.values.category}
        onChange={(e) => form.handleChange('category', e.target.value)}
      />

      <Checkbox
        label="Concordo com os termos"
        error={form.getFieldTouched('agreed') ? form.getFieldError('agreed') : ''}
        {...form.getFieldProps('agreed')}
        required
      />

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary flex-1">
          {form.isSubmitting ? 'Enviando...' : 'Enviar'}
        </button>
        <button type="button" onClick={form.handleReset} className="btn btn-secondary flex-1">
          Resetar
        </button>
      </div>
    </form>
  )
}
```

---

## 📚 Próximos Passos

1. **Ler a documentação completa:**
   - `FORM_SYSTEM_README.md`
   - `components/form/README.md`
   - `ARCHITECTURE.md`

2. **Explorar exemplos:**
   - `http://localhost:3000/form-example`
   - `http://localhost:3000/advanced-form-example`

3. **Criar seu primeiro formulário**
   - Copie o padrão acima
   - Customize os campos
   - Adicione sua lógica

4. **Conectar à API:**
   - Criar rota em `app/api/...`
   - Fazer POST request em `onSubmit`

---

## 🆘 Troubleshooting

### Input não atualiza

```tsx
// ✅ Certo - usar getFieldProps
<Input {...form.getFieldProps('email')} />

// ❌ Errado - faltam props
<Input value={form.values.email} />
```

### Erros não aparecem

```tsx
// ✅ Certo - mostrar apenas se tocado
error={form.getFieldTouched('email') ? form.getFieldError('email') : ''}

// ❌ Errado - sempre mostrar
error={form.getFieldError('email')}
```

### Hook não funciona

```tsx
// ✅ Use em componente 'use client'
'use client'

import { useForm } from '@/hooks/form'

// ❌ Não use em Server Components
// export default function MyComponent() { // Falta 'use client'
```

---

## 💡 Dicas

1. **Sempre marcar `required`:**
   ```tsx
   <Input required {...props} />
   ```

2. **Usar `helperText` para dicas:**
   ```tsx
   <Input helperText="Digite seu email" {...props} />
   ```

3. **Validar no blur para UX melhor:**
   ```tsx
   error={form.getFieldTouched('field') ? form.getFieldError('field') : ''}
   ```

4. **Desabilitar submit durante requisição:**
   ```tsx
   <button disabled={form.isSubmitting}>
   ```

---

## 📞 Precisa de Ajuda?

Consulte:
- `components/form/README.md` - Docs dos componentes
- `components/form/PATTERNS.md` - Padrões avançados
- `ARCHITECTURE.md` - Arquitetura geral

---

**Começar agora:** `npm run dev` e visite `/form-example` 🚀
