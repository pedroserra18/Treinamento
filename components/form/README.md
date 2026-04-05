# 📋 Componentes de Formulário

Sistema profissional, escalável e acessível de componentes reutilizáveis para formulários em React + TypeScript + Tailwind CSS.

## 🎯 Características

✅ **Totalmente Tipado** - TypeScript com tipos genéricos e interfaces bem definidas
✅ **Acessível** - ARIA labels, aria-invalid, aria-describedby
✅ **Flexível** - Props customizáveis para cada caso de uso
✅ **Estados Múltiplos** - default, focus, error, disabled, success
✅ **Dark Mode** - Suporte automático para tema escuro
✅ **Sem Dependências** - Puro React + Tailwind CSS
✅ **ForwardRef** - Acesso direto ao DOM quando necessário

## 📦 Componentes Disponíveis

### 1. **Input**
Campo de entrada de texto com suporte a ícones, erro e labels.

```tsx
import { Input } from '@/components/form'

export default function MyForm() {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  return (
    <Input
      id="username"
      label="Nome de Usuário"
      name="username"
      type="text"
      placeholder="Digite seu usuário"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      error={error}
      helperText="Mínimo de 3 caracteres"
      required
    />
  )
}
```

**Props:**
- `label?: string` - Rótulo do campo
- `name: string` - Nome do campo (para forms)
- `type?: string` - Tipo do input (text, email, password, etc)
- `placeholder?: string` - Placeholder
- `value: string` - Valor do campo
- `onChange: (e) => void` - Callback de mudança
- `error?: string` - Mensagem de erro
- `helperText?: string` - Texto de ajuda
- `required?: boolean` - É obrigatório?
- `disabled?: boolean` - Desabilitado?
- `icon?: ReactNode` - Ícone à esquerda
- `containerClassName?: string` - Classes customizadas do container

---

### 2. **Textarea**
Campo de texto longo com suporte a múltiplas linhas.

```tsx
import { Textarea } from '@/components/form'

<Textarea
  id="message"
  label="Mensagem"
  name="message"
  placeholder="Digite sua mensagem..."
  value={msg}
  onChange={(e) => setMsg(e.target.value)}
  rows={5}
  required
/>
```

**Props:**
- `label?: string` - Rótulo
- `placeholder?: string` - Placeholder
- `value: string` - Valor
- `onChange: (e) => void` - Callback
- `rows?: number` - Número de linhas (padrão: 4)
- `error?: string` - Mensagem de erro
- `helperText?: string` - Texto de ajuda
- `required?: boolean` - Obrigatório?
- `disabled?: boolean` - Desabilitado?

---

### 3. **Select**
Dropdown para seleção de opções.

```tsx
import { Select } from '@/components/form'
import type { SelectOption } from '@/components/form'

const options: SelectOption[] = [
  { value: 'opt1', label: 'Opção 1' },
  { value: 'opt2', label: 'Opção 2' },
  { value: 'opt3', label: 'Opção 3', disabled: true },
]

<Select
  id="category"
  label="Categoria"
  name="category"
  options={options}
  placeholder="Selecione..."
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
/>
```

**Props:**
- `label?: string` - Rótulo
- `options: SelectOption[]` - Lista de opções
- `placeholder?: string` - Texto padrão
- `value: string | number` - Valor selecionado
- `onChange: (e) => void` - Callback
- `error?: string` - Mensagem de erro
- `helperText?: string` - Texto de ajuda
- `required?: boolean` - Obrigatório?
- `disabled?: boolean` - Desabilitado?

---

### 4. **Checkbox**
Checkbox individual para seleção booleana.

```tsx
import { Checkbox } from '@/components/form'

<Checkbox
  id="agree"
  label="Concordo com os termos"
  description="Leia nossos termos e políticas"
  checked={agree}
  onChange={(e) => setAgree(e.target.checked)}
/>
```

**Props:**
- `label?: string` - Rótulo
- `description?: string` - Descrição adicional
- `checked: boolean` - Está marcado?
- `onChange: (e) => void` - Callback
- `error?: string` - Mensagem de erro
- `disabled?: boolean` - Desabilitado?

---

### 5. **Radio & RadioGroup**
Radio individual ou grupo de radio buttons.

```tsx
import { RadioGroup } from '@/components/form'
import type { RadioOption } from '@/components/form'

const plans: RadioOption[] = [
  {
    value: 'free',
    label: 'Plano Gratuito',
    description: 'Acesso limitado',
  },
  {
    value: 'pro',
    label: 'Plano Pro',
    description: 'Acesso completo',
  },
]

<RadioGroup
  name="plan"
  value={selected}
  onChange={(value) => setSelected(value)}
  options={plans}
  label="Escolha seu plano"
  required
/>
```

**Props:**
- `name: string` - Nome do grupo
- `options: RadioOption[]` - Lista de opções
- `value: string | number` - Valor selecionado
- `onChange: (value) => void` - Callback
- `label?: string` - Rótulo do grupo
- `error?: string` - Mensagem de erro
- `helperText?: string` - Texto de ajuda
- `required?: boolean` - Obrigatório?
- `disabled?: boolean` - Desabilitado?

---

### 6. **Switch**
Toggle/switch para valores booleanos.

```tsx
import { Switch } from '@/components/form'

<Switch
  id="notifications"
  label="Ativar Notificações"
  description="Receba alertas importantes"
  checked={enabled}
  onChange={(e) => setEnabled(e.target.checked)}
/>
```

**Props:**
- `label?: string` - Rótulo
- `description?: string` - Descrição
- `checked: boolean` - Está ativado?
- `onChange: (e) => void` - Callback
- `error?: string` - Mensagem de erro
- `disabled?: boolean` - Desabilitado?

---

### 7. **FormFieldWrapper**
Wrapper reutilizável para centralizar label, erro e helperText.

```tsx
import { FormFieldWrapper } from '@/components/form'

<FormFieldWrapper
  id="custom"
  label="Campo Customizado"
  error={error}
  helperText="Text de ajuda"
  required
>
  <input type="text" id="custom" />
</FormFieldWrapper>
```

**Props:**
- `id?: string` - ID para label
- `label?: string` - Rótulo
- `error?: string` - Mensagem de erro
- `helperText?: string` - Texto de ajuda
- `required?: boolean` - Obrigatório?
- `showRequired?: boolean` - Mostrar asterisco?
- `className?: string` - Classes customizadas
- `children: ReactNode` - Conteúdo

---

## 🎨 Sistema de Cores

Tailwind configurado com cores semânticas:

```js
// Primary (Azul)
primary: { 50, 100, 200, ..., 900 }

// Secondary (Roxo)
secondary: { 50, 100, 200, ..., 900 }

// Neutral (Cinza)
neutral: { 50, 100, 200, ..., 900 }

// Success (Verde)
success: { 50, 100, 200, ..., 900 }

// Danger (Vermelho)
danger: { 50, 100, 200, ..., 900 }

// Warning (Âmbar)
warning: { 50, 100, 200, ..., 900 }

// Info (Ciano)
info: { 50, 100, 200, ..., 900 }
```

**Uso:**
```tsx
<div className="text-primary-500">
<button className="bg-success-600 hover:bg-success-700">
<p className="text-danger-500">
```

---

## ✅ Validação e Utilidades

Arquivo `utils/form-validation.ts` fornece funções auxiliares:

```tsx
import {
  validateEmail,
  validatePhone,
  validateCPF,
  formatCPF,
  formatPhone,
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validateUrl,
  validatePattern,
} from '@/utils/form-validation'

// Exemplo de uso em validação
const validateForm = (values) => {
  const errors: FormErrors = {}

  if (!validateRequired(values.email)) {
    errors.email = 'Email é obrigatório'
  } else if (!validateEmail(values.email)) {
    errors.email = 'Email inválido'
  }

  if (!validateRequired(values.password)) {
    errors.password = 'Senha é obrigatória'
  } else if (!validateMinLength(values.password, 8)) {
    errors.password = 'Senha deve ter mínimo 8 caracteres'
  }

  return errors
}
```

---

## 🚀 Exemplo Completo

Veja `/app/form-example/page.tsx` para um formulário completo e funcional com:

- ✅ Validação de campos
- ✅ Estados de erro
- ✅ Estados de loading
- ✅ Todos os componentes em uso
- ✅ Tratamento de submissão

---

## 📝 Estrutura de Arquivos

```
components/
├── form/
│   ├── Input.tsx
│   ├── Textarea.tsx
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   ├── Radio.tsx
│   ├── Switch.tsx
│   ├── FormFieldWrapper.tsx
│   └── index.ts

types/
├── form/
│   └── index.ts

utils/
├── form-validation.ts

app/
├── form-example/
│   └── page.tsx
```

---

## 🔧 Boas Práticas

### 1. Sempre tipificar os valores do formulário
```tsx
interface MyFormValues {
  name: string
  email: string
  agree: boolean
}

const [values, setValues] = useState<MyFormValues>({...})
```

### 2. Validar apenas em campos tocados (touched)
```tsx
const [touched, setTouched] = useState<Record<string, boolean>>({})

error={touched.email ? errors.email : ''}
```

### 3. Usar forwardRef para acessar o DOM
```tsx
const inputRef = useRef<HTMLInputElement>(null)

<Input ref={inputRef} {...props} />

// Acessar: inputRef.current?.focus()
```

### 4. Separar lógica de validação
```tsx
const validateForm = (values: FormValues): FormErrors => {
  // Lógica de validação
}
```

### 5. Reutilizar validações com utilitários
```tsx
import { validateEmail, validateMinLength } from '@/utils/form-validation'
```

---

## 🎓 Acessibilidade

Todos os componentes incluem:

- ✅ `aria-label` - Para leitores de tela
- ✅ `aria-invalid` - Indica estado de erro
- ✅ `aria-describedby` - Vincula erros ao campo
- ✅ Navegação com Tab e Enter
- ✅ Labels associadas ao id
- ✅ Contraste de cores adequado

---

## 🤝 Contribuindo

Para adicionar novos componentes:

1. Criar o arquivo do componente em `components/form/`
2. Adicionar tipos em `types/form/index.ts`
3. Exportar em `components/form/index.ts`
4. Adicionar exemplo em `app/form-example/page.tsx`

---

## 📄 Licença

MIT
