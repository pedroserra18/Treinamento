import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { ImageViewer } from '../../components/common/ImageViewer'
import { updateAvatar } from '../../services/socialService'
import {
  confirmForgotPasswordWithCode,
  getGoogleLinkStatus,
  getProfileDefaults,
  requestEmailChangeCode,
  requestForgotPasswordCode,
  updateBirthDate,
  updateGender,
} from '../../services/authService'
import { sanitiseHandleInput, validateHandle } from '../../lib/handle'
import { PanelTitle, FieldLabel } from './ui'

// ─── Profile (avatar + name) ──────────────────────────────────────────────

export function ProfilePanel({
  authorizedFetch, applyUserPatch, refreshUser, updateName, avatarUrl, name, onDirtyChange,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  applyUserPatch: (patch: Partial<{ avatarUrl: string | null; name: string | null }>) => void
  refreshUser: () => Promise<void>
  updateName: (name: string) => Promise<void>
  avatarUrl: string | null
  name: string
  onDirtyChange?: (dirty: boolean) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(avatarUrl)
  const [avatarDirty, setAvatarDirty] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  useEffect(() => {
    if (!avatarDirty) setPreview(avatarUrl)
  }, [avatarUrl, avatarDirty])

  // Re-sync the local name draft if the cached user changes (e.g. another
  // tab updated it, or after a successful save).
  useEffect(() => {
    setNameDraft(name)
  }, [name])

  // Reporta "alterações não salvas" ao pai (nome editado ou avatar trocado).
  const isDirty = nameDraft.trim() !== name.trim() || avatarDirty
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const trimmedName = nameDraft.trim()
  const nameDirty = trimmedName !== name && trimmedName.length >= 2
  const nameTooShort = trimmedName.length > 0 && trimmedName.length < 2
  const nameTooLong = trimmedName.length > 120
  const dirty = avatarDirty || nameDirty

  // Same compression pipeline used by the previous Profile page — 256px max,
  // JPEG q=0.85 — so the avatar fits in our DB row without bloating it.
  const handleAvatar = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const original = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const target = 256
        const scale = Math.min(target / img.width, target / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setPreview(original)
          setAvatarDirty(true)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        setPreview(canvas.toDataURL('image/jpeg', 0.85))
        setAvatarDirty(true)
      }
      img.onerror = () => {
        setPreview(original)
        setAvatarDirty(true)
      }
      img.src = original
    }
    reader.readAsDataURL(file)
  }

  // Single save handler that commits whichever fields actually changed,
  // surfacing the first error that comes up. We do avatar first because it's
  // the more common change; name fails fast if validation rejected it.
  const save = async () => {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      if (avatarDirty && preview && preview !== avatarUrl) {
        const result = await updateAvatar(authorizedFetch as never, preview)
        const persistedUrl = result.avatarUrl ?? preview
        applyUserPatch({ avatarUrl: persistedUrl })
        setPreview(persistedUrl)
        setAvatarDirty(false)
      }
      if (nameDirty) {
        await updateName(trimmedName)
      }
      try { await refreshUser() } catch { /* server may lag, local patch already applied */ }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateAvatar(authorizedFetch as never, null)
      applyUserPatch({ avatarUrl: null })
      setPreview(null)
      setAvatarDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover avatar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelTitle title="Perfil" subtitle="Sua foto e nome aparecem no feed e em todos os lugares públicos." />

      <FieldLabel>Foto de perfil</FieldLabel>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => preview && setViewerOpen(true)}
          disabled={!preview}
          aria-label="Ver foto em tamanho grande"
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-default"
        >
          {preview
            ? <img src={preview} alt="" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-[var(--muted)]">{(name?.[0] ?? '?').toUpperCase()}</span>}
        </button>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Alterar fotografia
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Remover
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleAvatar(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-6">
        <FieldLabel>Nome</FieldLabel>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          maxLength={120}
          placeholder="Como você quer ser chamado"
          className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
        />
        {nameTooShort && (
          <p className="mt-1.5 text-[11px] text-amber-500">Mínimo 2 caracteres.</p>
        )}
        {nameTooLong && (
          <p className="mt-1.5 text-[11px] text-amber-500">Máximo 120 caracteres.</p>
        )}
        {!nameTooShort && !nameTooLong && (
          <p className="mt-1.5 text-[11px] text-[var(--muted)]">
            Aparece no feed, no perfil público e em comentários.
          </p>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-500">Alterações salvas.</p>}

      {dirty && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPreview(avatarUrl)
              setAvatarDirty(false)
              setNameDraft(name)
              setError(null)
            }}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || nameTooLong || (nameDirty && nameTooShort)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            {saving ? 'Salvando…' : <>Guardar alterações <Check size={12} /></>}
          </button>
        </div>
      )}

      {viewerOpen && preview && (
        <ImageViewer src={preview} alt={name || null} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  )
}

// ─── Account (email + password, both via 6-digit code verification) ──────

export function AccountPanel({
  authorizedFetch, email, updateEmail, startGoogleLink,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  email: string
  updateEmail: (newEmail: string, code: string) => Promise<void>
  startGoogleLink: () => Promise<void>
}) {
  // Google link state — purely a "connecting…" indicator since the actual
  // OAuth redirect happens via window.location and this component unmounts.
  // If the call rejects before redirecting (network error etc.), we surface
  // the message inline.
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const [googleLinkError, setGoogleLinkError] = useState<string | null>(null)
  // null = ainda carregando o status; true/false = vinculado ou não.
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    void getGoogleLinkStatus(authorizedFetch as never)
      .then((linked) => { if (!cancelled) setGoogleLinked(linked) })
      .catch(() => { if (!cancelled) setGoogleLinked(false) })
    return () => { cancelled = true }
  }, [authorizedFetch])

  // Data de nascimento — usada pelo quiz da IA pra calcular a idade
  // automaticamente. Carrega o valor atual e salva ao alterar.
  const [birthDate, setBirthDate] = useState('')
  const [birthDateSaved, setBirthDateSaved] = useState(false)
  // Gênero — salvo no perfil e reutilizado pelo quiz da IA (pula a pergunta).
  const [gender, setGender] = useState<'' | 'Masculino' | 'Feminino'>('')
  const [genderSaved, setGenderSaved] = useState(false)
  useEffect(() => {
    let cancelled = false
    void getProfileDefaults(authorizedFetch as never)
      .then((d) => {
        if (cancelled) return
        if (d.birthDate) setBirthDate(d.birthDate)
        if (d.gender === 'Masculino' || d.gender === 'Feminino') setGender(d.gender)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authorizedFetch])

  const saveBirthDate = async (value: string) => {
    setBirthDate(value)
    try {
      await updateBirthDate(authorizedFetch as never, value || null)
      setBirthDateSaved(true)
      setTimeout(() => setBirthDateSaved(false), 2500)
    } catch { /* silencioso */ }
  }

  const saveGender = async (value: 'Masculino' | 'Feminino') => {
    setGender(value)
    try {
      await updateGender(authorizedFetch as never, value)
      setGenderSaved(true)
      setTimeout(() => setGenderSaved(false), 2500)
    } catch { /* silencioso */ }
  }

  const connectGoogle = async () => {
    setLinkingGoogle(true)
    setGoogleLinkError(null)
    try {
      // On success, this navigates away — nothing else runs.
      await startGoogleLink()
    } catch (err) {
      setGoogleLinkError(err instanceof Error ? err.message : 'Erro ao conectar Google')
      setLinkingGoogle(false)
    }
  }

  // Email change: two-phase. Phase 1 = type new email + receive code; Phase 2 =
  // type code + confirm. The local `emailStep` drives which UI shows.
  type EmailStep = 'idle' | 'awaitingCode'
  const [emailStep, setEmailStep] = useState<EmailStep>('idle')
  const [emailDraft, setEmailDraft] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailConfirming, setEmailConfirming] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Same email pattern the registration zod schema accepts after .toLowerCase().
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim())
  const emailMatchesCurrent = emailDraft.trim().toLowerCase() === email.toLowerCase()
  const canRequestCode = emailLooksValid && !emailMatchesCurrent && !emailSending

  const requestCode = async () => {
    if (!canRequestCode) return
    setEmailSending(true)
    setEmailError(null)
    try {
      await requestEmailChangeCode(authorizedFetch as never, emailDraft.trim().toLowerCase())
      setEmailStep('awaitingCode')
      setEmailCode('')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao enviar código')
    } finally {
      setEmailSending(false)
    }
  }

  const confirmCode = async () => {
    if (emailCode.trim().length !== 6 || emailConfirming) return
    setEmailConfirming(true)
    setEmailError(null)
    try {
      await updateEmail(emailDraft.trim().toLowerCase(), emailCode.trim())
      setEmailStep('idle')
      setEmailDraft('')
      setEmailCode('')
      setEmailSuccess(true)
      setTimeout(() => setEmailSuccess(false), 3500)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Erro ao confirmar troca de email')
    } finally {
      setEmailConfirming(false)
    }
  }

  const cancelEmailFlow = () => {
    setEmailStep('idle')
    setEmailDraft('')
    setEmailCode('')
    setEmailError(null)
  }

  // Password change: piggy-backs on the existing forgot-password endpoints.
  // Phase 1 = send code to the user's CURRENT email; Phase 2 = type code +
  // new password. No new backend route needed.
  type PwStep = 'idle' | 'awaitingCode'
  const [pwStep, setPwStep] = useState<PwStep>('idle')
  const [pwCode, setPwCode] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwSending, setPwSending] = useState(false)
  const [pwConfirming, setPwConfirming] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const requestPwCode = async () => {
    if (pwSending || !email) return
    setPwSending(true)
    setPwError(null)
    try {
      await requestForgotPasswordCode({ email })
      setPwStep('awaitingCode')
      setPwCode('')
      setPwNew('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Erro ao enviar código')
    } finally {
      setPwSending(false)
    }
  }

  const confirmPw = async () => {
    if (pwCode.trim().length !== 6 || pwNew.length < 8 || pwConfirming) return
    setPwConfirming(true)
    setPwError(null)
    try {
      await confirmForgotPasswordWithCode({
        email,
        verificationCode: pwCode.trim(),
        newPassword: pwNew,
      })
      setPwStep('idle')
      setPwCode('')
      setPwNew('')
      setPwSuccess(true)
      setTimeout(() => setPwSuccess(false), 3500)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Erro ao alterar senha')
    } finally {
      setPwConfirming(false)
    }
  }

  const cancelPwFlow = () => {
    setPwStep('idle')
    setPwCode('')
    setPwNew('')
    setPwError(null)
  }

  return (
    <div>
      <PanelTitle title="Conta" subtitle="Email e credenciais usadas para entrar." />

      {/* ── EMAIL ────────────────────────────────────────────────────── */}
      <FieldLabel>Email atual</FieldLabel>
      <input
        type="email"
        value={email}
        readOnly
        className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)]"
      />

      <div className="mt-4 max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
        {emailStep === 'idle' && (
          <>
            <FieldLabel>Novo email</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="voce@dominio.com"
                autoComplete="email"
                className="flex-1 min-w-[200px] rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={!canRequestCode}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {emailSending ? 'Enviando…' : 'Enviar código'}
              </button>
            </div>
            {emailDraft && emailMatchesCurrent && (
              <p className="mt-2 text-[11px] text-amber-500">Digite um email diferente do atual.</p>
            )}
            {emailDraft && !emailLooksValid && !emailMatchesCurrent && (
              <p className="mt-2 text-[11px] text-amber-500">Formato de email inválido.</p>
            )}
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Enviamos um código de 6 dígitos para o <b>novo</b> email pra confirmar que ele é seu.
            </p>
          </>
        )}

        {emailStep === 'awaitingCode' && (
          <>
            <FieldLabel>Código enviado para {emailDraft}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                autoFocus
                className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-base tracking-[0.3em] text-[var(--text)] outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => void confirmCode()}
                disabled={emailCode.length !== 6 || emailConfirming}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {emailConfirming ? 'Confirmando…' : 'Confirmar troca'}
              </button>
              <button
                type="button"
                onClick={cancelEmailFlow}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
              >
                Cancelar
              </button>
            </div>
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={emailSending}
              className="mt-2 font-mono text-[11px] text-[var(--muted)] underline hover:text-[var(--text)] disabled:opacity-50"
            >
              {emailSending ? 'Reenviando…' : 'Reenviar código'}
            </button>
          </>
        )}

        {emailError && <p className="mt-2 text-[12px] text-red-500">{emailError}</p>}
        {emailSuccess && <p className="mt-2 text-[12px] text-emerald-500">Email atualizado.</p>}
      </div>

      {/* ── DATA DE NASCIMENTO ──────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Data de nascimento</FieldLabel>
        <div className="max-w-md">
          <input
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            min="1920-01-01"
            onChange={(e) => void saveBirthDate(e.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
          />
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            Usada pelo treino por IA pra calcular sua idade automaticamente.
          </p>
          {birthDateSaved && <p className="mt-1 text-[12px] text-emerald-500">Salvo.</p>}
        </div>
      </div>

      {/* ── GÊNERO ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Gênero</FieldLabel>
        <div className="max-w-md">
          <div className="grid grid-cols-2 gap-2">
            {(['Masculino', 'Feminino'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => void saveGender(g)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  gender === g
                    ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                    : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/40'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            Usado pelo treino por IA pra definir a ênfase muscular padrão.
          </p>
          {genderSaved && <p className="mt-1 text-[12px] text-emerald-500">Salvo.</p>}
        </div>
      </div>

      {/* ── GOOGLE LINK ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Login com Google</FieldLabel>
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
          {googleLinked === true ? (
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden className="shrink-0">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-11.3 8c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10.5 0 19-8.5 19-19 0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8a12 12 0 0 1 11.1-7.5c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 16.3 5 9.7 9.4 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.5-5.3l-6.2-5.3a12 12 0 0 1-7.3 2.6 12 12 0 0 1-11.3-8l-6.6 5.1C9.5 38.5 16.2 43 24 43z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.4l6.2 5.3C40.1 36.7 44 31.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
                  <Check size={14} className="text-emerald-500" />
                  Conta Google conectada
                </p>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">{email}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[13px] text-[var(--text)]">
                Conecte sua conta Google para poder entrar com um clique nas próximas
                vezes (sem precisar digitar email e senha).
              </p>
              <p className="mb-3 text-[11.5px] text-[var(--muted)]">
                A conta Google precisa usar o mesmo email da sua conta atual{' '}
                <b className="text-[var(--text)]">({email})</b> — caso contrário a
                vinculação será recusada.
              </p>
              <button
                type="button"
                onClick={() => void connectGoogle()}
                disabled={linkingGoogle || googleLinked === null}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                {/* Google "G" multi-color logo, inline SVG so we don't pull a CDN */}
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-11.3 8c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19c10.5 0 19-8.5 19-19 0-1.3-.1-2.4-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8a12 12 0 0 1 11.1-7.5c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.6 29.3 5 24 5 16.3 5 9.7 9.4 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 43c5.2 0 9.9-2 13.5-5.3l-6.2-5.3a12 12 0 0 1-7.3 2.6 12 12 0 0 1-11.3-8l-6.6 5.1C9.5 38.5 16.2 43 24 43z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.4l6.2 5.3C40.1 36.7 44 31.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                </svg>
                {linkingGoogle ? 'Conectando…' : 'Conectar conta Google'}
              </button>
              {googleLinkError && (
                <p className="mt-2 text-[12px] text-red-500">{googleLinkError}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── PASSWORD ─────────────────────────────────────────────────── */}
      <div className="mt-6">
        <FieldLabel>Senha</FieldLabel>
        <div className="max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5">
          {pwStep === 'idle' && (
            <>
              <p className="mb-2 text-[13px] text-[var(--text)]">
                Para alterar a senha, enviamos um código de 6 dígitos para o seu email atual.
              </p>
              <button
                type="button"
                onClick={() => void requestPwCode()}
                disabled={pwSending || !email}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
              >
                {pwSending ? 'Enviando…' : 'Alterar senha'}
              </button>
            </>
          )}

          {pwStep === 'awaitingCode' && (
            <div className="space-y-3">
              <div>
                <FieldLabel>Código enviado para {email}</FieldLabel>
                <input
                  type="text"
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  className="w-28 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center font-mono text-base tracking-[0.3em] text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
              </div>
              <div>
                <FieldLabel>Nova senha</FieldLabel>
                <input
                  type="password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
                {pwNew.length > 0 && pwNew.length < 8 && (
                  <p className="mt-1.5 text-[11px] text-amber-500">Mínimo 8 caracteres.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void confirmPw()}
                  disabled={pwCode.length !== 6 || pwNew.length < 8 || pwConfirming}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
                >
                  {pwConfirming ? 'Salvando…' : 'Salvar nova senha'}
                </button>
                <button
                  type="button"
                  onClick={cancelPwFlow}
                  className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Cancelar
                </button>
              </div>
              <button
                type="button"
                onClick={() => void requestPwCode()}
                disabled={pwSending}
                className="font-mono text-[11px] text-[var(--muted)] underline hover:text-[var(--text)] disabled:opacity-50"
              >
                {pwSending ? 'Reenviando…' : 'Reenviar código'}
              </button>
            </div>
          )}

          {pwError && <p className="mt-2 text-[12px] text-red-500">{pwError}</p>}
          {pwSuccess && <p className="mt-2 text-[12px] text-emerald-500">Senha alterada.</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Handle ───────────────────────────────────────────────────────────────

export function HandlePanel({
  currentHandle, updateHandle, onDirtyChange,
}: {
  currentHandle: string
  updateHandle: (handle: string) => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState(currentHandle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const formatError = validateHandle(draft)
  const changed = draft.trim().toLowerCase() !== currentHandle

  useEffect(() => {
    onDirtyChange?.(changed)
  }, [changed, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const save = async () => {
    const next = draft.trim().toLowerCase()
    if (!next || formatError || !changed) return
    setSaving(true)
    setError(null)
    try {
      await updateHandle(next)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar handle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelTitle
        title="@handle público"
        subtitle="É como outros usuários encontram você no feed e nos perfis públicos. Letras, números, '.', '_' e '-'."
      />

      <FieldLabel>Seu handle</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] focus-within:border-[var(--brand)]">
          <span className="pl-3 pr-1 text-[var(--muted)]">@</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(sanitiseHandleInput(e.target.value))}
            className="flex-1 bg-transparent py-2 pr-3 text-sm text-[var(--text)] outline-none"
            placeholder="seu_handle"
          />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || saving || Boolean(formatError)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {formatError && changed && <p className="mt-2 text-[12px] text-amber-500">{formatError}</p>}
      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      {success && <p className="mt-2 text-[12px] text-emerald-500">Handle atualizado.</p>}
    </div>
  )
}
