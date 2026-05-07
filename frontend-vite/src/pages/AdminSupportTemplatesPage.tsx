import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
  type SupportTemplate,
} from '../services/supportService'

export function AdminSupportTemplatesPage() {
  const { authorizedFetch } = useAuth()
  const [templates, setTemplates] = useState<SupportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    try {
      const data = await listTemplates(authorizedFetch)
      setTemplates(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (tpl: SupportTemplate) => {
    setEditingId(tpl.id)
    setDraftTitle(tpl.title)
    setDraftBody(tpl.body)
    setShowNew(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftTitle('')
    setDraftBody('')
    setShowNew(false)
  }

  const saveExisting = async (id: string) => {
    if (!draftTitle.trim() || !draftBody.trim()) return
    setSaving(true)
    try {
      await updateTemplate(authorizedFetch, id, { title: draftTitle.trim(), body: draftBody.trim() })
      await refresh()
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const saveNew = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) return
    setSaving(true)
    try {
      await createTemplate(authorizedFetch, { title: draftTitle.trim(), body: draftBody.trim() })
      await refresh()
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esse template?')) return
    try {
      await deleteTemplate(authorizedFetch, id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir')
    }
  }

  return (
    <section className="space-y-4">
      <Link to="/admin/support" className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">
        <ArrowLeft size={14} /> Voltar para fila
      </Link>

      <header className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h1 className="text-2xl font-black text-[var(--text)]">Respostas prontas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Templates reutilizáveis para acelerar respostas. Você pode editá-los ao aplicar.
        </p>
      </header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!showNew && !editingId ? (
        <button
          type="button"
          onClick={() => {
            setShowNew(true)
            setDraftTitle('')
            setDraftBody('')
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white"
        >
          <Plus size={14} /> Novo template
        </button>
      ) : null}

      {showNew ? (
        <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Título (ex: Post removido por imagem imprópria)"
            maxLength={100}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Corpo da resposta..."
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelEdit} className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]">
              <X size={12} className="inline" /> Cancelar
            </button>
            <button
              type="button"
              onClick={saveNew}
              disabled={saving || !draftTitle.trim() || !draftBody.trim()}
              className="rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Save size={12} className="inline" /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      ) : templates.length === 0 && !showNew ? (
        <p className="text-sm text-[var(--muted)]">Nenhum template criado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((tpl) => (
            <li key={tpl.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
              {editingId === tpl.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={cancelEdit} className="rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => saveExisting(tpl.id)}
                      disabled={saving}
                      className="rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text)]">{tpl.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">{tpl.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(tpl)}
                      className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      aria-label="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl.id)}
                      className="rounded-lg border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10"
                      aria-label="Excluir"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
