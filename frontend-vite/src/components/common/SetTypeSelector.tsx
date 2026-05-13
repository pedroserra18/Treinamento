import { SET_TYPE_OPTIONS, type SetType } from './setTypeOptions'

type SetTypeSelectorProps = {
  value: SetType
  onChange: (value: SetType) => void
  allowedTypes?: SetType[]
}

export function SetTypeSelector({ value, onChange, allowedTypes }: SetTypeSelectorProps) {
  const options = allowedTypes
    ? SET_TYPE_OPTIONS.filter((opt) => allowedTypes.includes(opt.value))
    : SET_TYPE_OPTIONS
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SetType)}
      className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
