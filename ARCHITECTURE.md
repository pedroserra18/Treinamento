# 🏗️ Arquitetura do Sistema de Formulários

Documentação de arquitetura, decisões de design e padrões utilizados.

---

## 📐 Arquitetura de Camadas

```
┌─────────────────────────────────────────────────┐
│         Componentes de UI (React Components)     │
│  Input | Textarea | Select | Checkbox | etc     │
└────────────────┬────────────────────────────────┘
                 │ Props baseadas em tipos
                 ▼
┌─────────────────────────────────────────────────┐
│         Wrapper Reutilizável                     │
│         (FormFieldWrapper)                       │
│  - Label centralizado                           │
│  - Erro com mensagem                            │
│  - Helper text                                  │
└────────────────┬────────────────────────────────┘
                 │ Encapsula label + field + error
                 ▼
┌─────────────────────────────────────────────────┐
│         Hooks de Formulário                      │
│         (useForm, useFormField)                  │
│  - Gerenciamento de estado                      │
│  - Validação integrada                          │
│  - Manipuladores de evento                      │
└────────────────┬────────────────────────────────┘
                 │ Lógica reutilizável
                 ▼
┌─────────────────────────────────────────────────┐
│         Utilitários & Tipos                      │
│  - Validação (validateEmail, etc)               │
│  - Tipos (FormValues, ValidationRule, etc)      │
│  - Formatação (formatCPF, etc)                  │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Dados

### 1. Renderização de Componente

```
App Component
    ↓
useForm Hook
    ├─ initialValues
    ├─ validate function
    └─ onSubmit callback
    ↓
Local State
    ├─ values
    ├─ errors
    ├─ touched
    └─ isSubmitting
    ↓
Form JSX
    ├─ Input (com ...getFieldProps)
    ├─ Textarea
    ├─ Select
    └─ Buttons
    ↓
Renderização na Tela
```

### 2. Fluxo de Validação

```
User Input
    ↓
onChange → handleChange
    ↓
Clear errors (se houver)
    ↓
Update state
    ↓
onBlur → handleBlur
    ↓
Mark as touched
    ↓
Show errors (se touched E houver erro)
```

### 3. Fluxo de Submissão

```
Form Submit
    ↓
Prevent default
    ↓
Run validation
    ├─ Sem erros → Enviar
    └─ Com erros → Mostrar
    ↓
setIsSubmitting = true
    ↓
Chamar onSubmit
    ↓
API call (se houver)
    ↓
setIsSubmitting = false
    ↓
Reset (opcional)
```

---

## 🎯 Princípios de Design

### 1. **Composição sobre Herança**

```tsx
// ✅ Bom - Wrapper com children
<FormFieldWrapper label="Email" error={error}>
  <input />
</FormFieldWrapper>

// ❌ Ruim - Herança profunda
class TextInput extends BaseInput extends FormField { ... }
```

### 2. **Props Explícitas**

```tsx
// ✅ Bom - Props claras e tipadas
interface InputProps {
  label?: string
  error?: string
  helperText?: string
  required?: boolean
}

// ❌ Ruim - Props implícitas
const Input = ({ ...props }) => ...
```

### 3. **Separação de Responsabilidades**

```
Input.tsx
  └─ Apenas renderização + eventos

FormFieldWrapper.tsx
  └─ Apenas label + erro + helperText

useForm.ts
  └─ Apenas lógica de estado e validação

form-validation.ts
  └─ Apenas funções de validação
```

### 4. **Reusabilidade**

```tsx
// FormFieldWrapper é reusável com qualquer input
<FormFieldWrapper label="Custom">
  <input /> {/* Seu próprio input */}
</FormFieldWrapper>

// useForm funciona com qualquer tipo de valores
useForm<MeuTipo>({...})
```

### 5. **Type Safety**

```tsx
// ✅ Tipos genéricos
const form = useForm<MyValues>({...})

// ✅ Props tipadas
<Input {...props: BaseInputProps} />

// ✅ Retornos tipados
getFieldError('email'): string | undefined
```

---

## 🔧 Padrões Utilizados

### 1. **ForwardRef Pattern**

```tsx
export const Input = React.forwardRef<HTMLInputElement, BaseInputProps>(
  ({ ... }, ref) => (
    <input ref={ref} {...props} />
  )
)

// Uso
const inputRef = useRef<HTMLInputElement>(null)
<Input ref={inputRef} />
inputRef.current?.focus()
```

### 2. **Compound Components (FormFieldWrapper + Input)**

```tsx
<FormFieldWrapper label="Email" error={error}>
  <Input {...props} />
</FormFieldWrapper>

// Separação clara de responsabilidades
// FormFieldWrapper: label, erro, helperText
// Input: apenas o campo
```

### 3. **Custom Hooks para State Management**

```tsx
const form = useForm({
  initialValues: {...},
  validate: {...},
  onSubmit: {...}
})

// Lógica reutilizável em múltiplos componentes
```

### 4. **Helper Functions**

```tsx
form.getFieldProps('email')
// Retorna { name, value, onChange, onBlur }
// Simplifica muito a escrita

<Input {...form.getFieldProps('email')} />
// Em vez de
<Input
  name="email"
  value={form.values.email}
  onChange={(e) => form.handleChange('email', e.target.value)}
  onBlur={() => form.handleBlur('email')}
/>
```

### 5. **Controlled Components**

Todos os componentes são controlled:

```tsx
// ✅ Valor vem de state
<Input value={form.values.email} onChange={...} />

// ❌ Evitar uncontrolled
<Input defaultValue="..." />
```

---

## 📊 Decisões Arquiteturais

### Por que FormFieldWrapper?

**Problema:**
- Label, erro e helperText eram repetidos em cada campo

**Solução:**
- Criar um wrapper reutilizável
- Centralizar a lógica
- Reduzir duplicação de código

**Benefício:**
```tsx
// Sem wrapper (antes)
<label>{label} {required && <span>*</span>}</label>
<input />
{error && <span>{error}</span>}

// Com wrapper (depois)
<FormFieldWrapper label={label} error={error}>
  <input />
</FormFieldWrapper>
```

### Por que useForm Hook?

**Problema:**
- Gerenciar estado (values, errors, touched) é repetitivo
- Lógica de validação espalhada pelo código

**Solução:**
- Centralizar em um hook customizado
- Fornecer métodos comuns (handleChange, handleBlur, etc)
- Suportar validação integrada

**Benefício:**
```tsx
// Sem hook (antes)
const [values, setValues] = useState({...})
const [errors, setErrors] = useState({...})
const [touched, setTouched] = useState({...})
// + 50 linhas de lógica

// Com hook (depois)
const form = useForm({...}) // Tudo pronto!
```

### Por que Dark Mode em Tailwind?

**Problema:**
- Suportar tema escuro é comum mas complexo

**Solução:**
- Usar `dark:` prefix do Tailwind
- Configurar em `tailwind.config.js`
- Aplicar automaticamente

**Benefício:**
```tsx
<div className="bg-white dark:bg-neutral-900">
// Automático com [prefers-color-scheme] ou .dark class
```

### Por que Cores Semânticas?

**Problema:**
- Cores hardcoded são difíceis de manter
- Sem consistência visual

**Solução:**
- Sistema de cores: primary, secondary, danger, success, etc
- Variações (50-900) para diferentes intensidades

**Benefício:**
```tsx
// ✅ Semântico
<button className="bg-primary-500">

// ❌ Hardcoded
<button className="bg-blue-500">
```

---

## 🔐 Tipagem e Segurança

### Generic Types

```tsx
// Formulário totalmente tipado
interface FormValues {
  email: string
  name: string
}

const form = useForm<FormValues>({
  initialValues: {
    email: '',
    name: ''
  }
})

// form.values.email → string (seguro)
// form.values.foo    → ❌ Erro TypeScript
```

### Type Inference

```tsx
// TypeScript detecta tipos automaticamente
const form = useForm({
  initialValues: { email: '', count: 0 },
  // form.values.email: string ✅
  // form.values.count: number ✅
})
```

### Union Types para Validação

```tsx
type FormFieldState = 'default' | 'focus' | 'error' | 'disabled' | 'success'

// Apenas esses valores são aceitos
const state: FormFieldState = 'error' ✅
const state: FormFieldState = 'invalid' ❌ Erro
```

---

## ♿ Acessibilidade

### ARIA Attributes

```tsx
aria-label       // Rótulo para leitores de tela
aria-invalid     // Indica estado de erro
aria-describedby // Vincula descrição ao elemento
aria-required    // Marca como obrigatório
```

### Label Association

```tsx
<label htmlFor="email">Email</label>
<input id="email" />
// Clique no label foca o input
```

### Contraste e Legibilidade

```
// Cores selecionadas com bom contraste WCAG AA
// texto-neutral-900 em fundo branco → ✅ 13.58:1
```

---

## 🎯 Decisões de Performance

### 1. **Memoization**

```tsx
const handleChange = useCallback(
  (field, value) => { ... },
  [errors] // Dependencies
)
// Evita recriação a cada render
```

### 2. **Controlled Components**

```tsx
// Evita ref.current.value (acesso ao DOM)
value={form.values.email}
// State é sempre sincronizado
```

### 3. **Lazy Validation**

```tsx
// Validar apenas campos tocados
error={touched.email ? errors.email : ''}
// Reduz validações desnecessárias
```

---

## 📈 Escalabilidade

### Adicionar Novo Componente

1. Criar arquivo em `components/form/NomeComponente.tsx`
2. Adicionar tipos em `types/form/index.ts`
3. Exportar em `components/form/index.ts`
4. Usar com FormFieldWrapper

### Adicionar Nova Validação

```tsx
// Adicionar em utils/form-validation.ts
export const validateCustom = (value: string): boolean => {
  return value.includes('valid')
}

// Usar no formulário
const form = useForm({
  validate: (values) => {
    const errors = {}
    if (!validateCustom(values.field)) {
      errors.field = 'Inválido'
    }
    return errors
  }
})
```

---

## 🚀 Deployment Considerations

### Build Optimization

```tsx
// Componentes são small bundles
Input:     ~2KB
Select:    ~1.5KB
useForm:   ~3KB
Total:     ~6.5KB (gzip)
```

### Tree-shaking

```tsx
// Exportar apenas o necessário
export { Input } from './Input' // ✅ Tree-shakeable
export * from './index' // Tudo
```

### Image Optimization

Os ícones usados são inline SVG (sem imagens externas)

---

## 🔍 Debugging Tips

### 1. Verificar Estado do Formulário

```tsx
console.log('Valores:', form.values)
console.log('Erros:', form.errors)
console.log('Tocados:', form.touched)
console.log('Dirty:', form.isDirty)
console.log('Submitting:', form.isSubmitting)
```

### 2. Usar React DevTools

```
Components → Seu Componente → Hook State
Veja todo estado em tempo real
```

### 3. Adicionar console.logs

```tsx
const form = useForm({
  onSubmit: async (values) => {
    console.log('Before API:', values)
    const response = await api.submit(values)
    console.log('After API:', response)
  }
})
```

---

## 📝 Conclusão

Sistema de arquitetura profissional baseado em:

- ✅ Separação clara de responsabilidades
- ✅ Reusabilidade máxima
- ✅ Type safety com TypeScript
- ✅ Performance otimizada
- ✅ Acessibilidade garantida
- ✅ Escalabilidade futura

Pronto para crescer seu projeto! 🚀

---

_Documentação técnica do Sistema de Formulários v1.0_
