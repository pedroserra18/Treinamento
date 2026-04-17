import { SET_TYPE_OPTIONS, type SetType } from './setTypeOptions'

type SetTypeSelectorProps = {
  value: SetType
  onChange: (value: SetType) => void
}

export function SetTypeSelector({ value, onChange }: SetTypeSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SetType)}
      className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
    >
      {SET_TYPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
