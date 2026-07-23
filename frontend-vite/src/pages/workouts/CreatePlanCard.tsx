// Card "Criar treino" (nome + descrição + botão) da WorkoutsPage. Sem estado
// próprio — os valores e a ação vêm por props (estado fica na página).
export function CreatePlanCard({
  name, description, onNameChange, onDescriptionChange, onCreate,
}: {
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-20 blur-3xl animate-[tech-spin_22s_linear_infinite]"
        style={{ background: 'var(--tech-gradient-conic)' }}
      />
      <h2 className="relative text-lg font-extrabold text-[var(--text)]">Criar treino</h2>
      <div className="mt-2 grid gap-2">
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nome do treino"
          className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
        />
        <textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Descricao"
          rows={2}
          className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="w-fit rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-bold text-black"
          onClick={onCreate}
        >
          Criar e salvar treino
        </button>
      </div>
    </article>
  )
}
