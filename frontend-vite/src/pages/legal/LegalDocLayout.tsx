import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUp } from 'lucide-react'

// Layout compartilhado dos documentos legais (Termos, Privacidade).
// Replica o padrão usado em apps como Strava/Linear/Notion:
//   • Header com badge de "Última atualização" em destaque
//   • Sumário (TOC) lateral sticky em telas grandes (>= lg)
//   • Conteúdo principal com anchor links (#section-id)
//   • Botão "voltar ao topo" flutuante após scroll
//
// Sections são passadas como dados pra o componente renderizar tanto o TOC
// quanto o conteúdo — single source of truth, sem risco de TOC ficar
// fora de sincronia com o que está escrito.

export type LegalSection = {
  id: string
  number: string
  title: string
  body: ReactNode
}

export type LegalDocProps = {
  title: ReactNode
  subtitle: string
  lastUpdated: string
  icon: ReactNode
  intro?: ReactNode
  sections: LegalSection[]
  footerNote?: string
}

export function LegalDocLayout({ title, subtitle, lastUpdated, icon, intro, sections, footerNote }: LegalDocProps) {
  const [showBackTop, setShowBackTop] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Aparece o botão "voltar ao topo" depois que o user rolou pelo menos
  // uma viewport — sinaliza que ele já está embrenhado no documento.
  useEffect(() => {
    const onScroll = () => {
      setShowBackTop(window.scrollY > window.innerHeight * 0.8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight da seção visível no TOC. IntersectionObserver é o jeito
  // performático de fazer scroll spy sem listener manual no scroll.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [sections])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToSection = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 16
    window.scrollTo({ top, behavior: 'smooth' })
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={11} />
        Voltar
      </Link>

      <header className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)]">
              {icon}
              Documento legal
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">{title}</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)] sm:max-w-2xl">{subtitle}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3 text-center">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Última atualização
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-[var(--text)]">{lastUpdated}</div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* ── TOC lateral ── (>= lg, sticky) */}
        <aside className="hidden lg:block">
          <nav className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Sumário
            </p>
            <ol className="space-y-0.5">
              {sections.map((section) => {
                const active = activeId === section.id
                return (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={(e) => scrollToSection(section.id, e)}
                      className={`flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-[12px] leading-snug transition-colors ${
                        active
                          ? 'bg-[var(--surface-hover)] font-semibold text-[var(--text)]'
                          : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className={`font-mono text-[10px] ${active ? 'text-[var(--brand)]' : 'opacity-50'}`}>
                        {section.number}
                      </span>
                      <span>{section.title}</span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </nav>
        </aside>

        {/* ── Conteúdo ── */}
        <div className="min-w-0 space-y-6">
          {intro}
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
            >
              <a
                href={`#${section.id}`}
                onClick={(e) => scrollToSection(section.id, e)}
                className="group block"
                aria-label={`Link para a seção ${section.title}`}
              >
                <h2 className="flex items-baseline gap-2 text-lg font-bold tracking-tight text-[var(--text)]">
                  <span className="font-mono text-[12px] font-semibold text-[var(--muted)]">{section.number}.</span>
                  <span>{section.title}</span>
                  <span className="ml-1 font-mono text-[11px] text-transparent transition-colors group-hover:text-[var(--brand)]">#</span>
                </h2>
              </a>
              <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[var(--text)]">
                {section.body}
              </div>
            </section>
          ))}

          {footerNote ? (
            <footer className="rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)] p-4 text-center">
              <p className="text-[11px] text-[var(--muted)]">{footerNote}</p>
            </footer>
          ) : null}
        </div>
      </div>

      {/* ── Voltar ao topo ── (aparece após scroll) */}
      {showBackTop ? (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Voltar ao topo"
          className="fixed bottom-6 right-6 z-30 grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-lg backdrop-blur transition-transform hover:scale-110 active:scale-95"
        >
          <ArrowUp size={16} />
        </button>
      ) : null}
    </article>
  )
}

// ─── Inline helpers reusáveis pelos documentos ─────────────────────────────

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[var(--text)]">{children}</p>
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[var(--text)]">{children}</strong>
}

export function Email({ children }: { children: string }) {
  return (
    <a href={`mailto:${children}`} className="font-mono text-[12.5px] text-[var(--brand-strong)] hover:underline">
      {children}
    </a>
  )
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, i) => (
        <li
          key={i}
          className="list-disc text-[13.5px] leading-relaxed text-[var(--text)] marker:text-[var(--brand)]"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

export function Highlight({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/8 p-5 text-[13.5px] leading-relaxed text-[var(--text)] sm:p-6">
      {children}
    </div>
  )
}
