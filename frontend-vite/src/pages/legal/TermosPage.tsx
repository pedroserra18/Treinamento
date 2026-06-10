import { Link } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

// Termos de Uso — adaptado pro SerraAthlo, fitness + IA + social. NÃO É
// CONSELHO JURÍDICO; se monetizar ou crescer vale revisão por advogado.
//
// Especialmente importantes pro contexto: disclaimer médico (fitness app
// nunca substitui profissional), limitação IA (sugestões, não prescrições)
// e propriedade intelectual sobre conteúdo do user.
const LAST_UPDATED = '10/06/2026'
const CONTACT_EMAIL = 'pedrovasco98765@gmail.com'
const MIN_AGE = 14
const APP_NAME = 'SerraAthlo'

export function TermosPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={11} />
        Voltar
      </Link>

      <header className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)]">
          <FileText size={12} />
          Documento legal
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          Termos de <span className="font-serif-accent italic text-[var(--brand-strong)]">Uso</span>
        </h1>
        <p className="mt-3 text-[13px] text-[var(--muted)]">
          Estes termos regulam o uso do aplicativo {APP_NAME}. Ao criar conta e usar o serviço,
          você concorda com tudo o que está aqui. Leia com calma — escrevemos sem juridiquês.
        </p>
        <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">Última atualização: {LAST_UPDATED}</p>
      </header>

      <Highlight>
        ⚠️ <Strong>Importante (saúde):</Strong> o {APP_NAME} é uma ferramenta de organização e
        sugestão de treinos. Ele <Strong>não substitui</Strong> a orientação de educador físico,
        médico ou fisioterapeuta. Antes de iniciar ou alterar significativamente seu programa
        de exercícios, especialmente se você tem condições de saúde preexistentes, consulte um
        profissional qualificado.
      </Highlight>

      <Section title="1. Quem oferece o serviço">
        <P>
          O {APP_NAME} é desenvolvido e mantido por um desenvolvedor independente, identificado
          neste documento como <Strong>"nós"</Strong>. Contato: <Email>{CONTACT_EMAIL}</Email>.
        </P>
      </Section>

      <Section title="2. O que é o SerraAthlo">
        <P>
          Uma plataforma para planejar, registrar e acompanhar treinos físicos, com recursos de:
        </P>
        <List items={[
          'Criação manual de rotinas e exercícios personalizados.',
          'Geração de treinos por inteligência artificial baseada nos seus dados.',
          'Acompanhamento de progresso (peso, medidas, sessões concluídas).',
          'Feed social pra compartilhar treinos com pessoas que você segue.',
          'Competições entre usuários.',
          'Planos PRO/FREE com diferentes limites de uso.',
        ]} />
      </Section>

      <Section title="3. Conta e cadastro">
        <List items={[
          <>Você precisa ter <Strong>{MIN_AGE} anos ou mais</Strong> pra criar uma conta. Se for menor, precisa de autorização dos responsáveis.</>,
          <>Os dados que você fornecer devem ser <Strong>verdadeiros</Strong>. Conta com dados falsos pode ser suspensa sem aviso.</>,
          <>Você é responsável pela segurança da sua senha. Use senha forte e não compartilhe.</>,
          <>Uma conta por pessoa. Contas duplicadas podem ser excluídas.</>,
          <>Você pode excluir sua conta a qualquer momento em <Strong>Configurações &gt; Excluir conta</Strong>.</>,
        ]} />
      </Section>

      <Section title="4. Uso aceitável">
        <P>Ao usar o {APP_NAME}, você concorda em <Strong>NÃO</Strong>:</P>
        <List items={[
          'Usar robôs, scripts ou meios automatizados pra interagir com o app.',
          'Tentar burlar limites do plano FREE com várias contas.',
          'Atacar a integridade técnica do app (DDoS, scraping massivo, exploits).',
          'Publicar conteúdo ilegal, racista, sexual, violento ou que assedie outras pessoas.',
          'Impersonar terceiros (criar conta como se fosse outra pessoa).',
          'Coletar dados de outros usuários sem o consentimento deles.',
          'Vender, sublicenciar ou redistribuir o serviço.',
        ]} />
        <P>
          Violar essas regras pode resultar em suspensão ou exclusão da conta sem reembolso,
          além de eventuais medidas legais cabíveis.
        </P>
      </Section>

      <Section title="5. Conteúdo que você publica">
        <P>
          Tudo que você cria no app (rotinas, exercícios personalizados, posts, fotos) é <Strong>seu</Strong>.
          Você apenas nos dá uma <Strong>licença gratuita e não exclusiva</Strong> pra armazenar, exibir
          e processar esse conteúdo dentro do app, conforme necessário pra funcionar.
        </P>
        <P>
          Você garante que tem direito sobre tudo que publica (fotos de terceiros, frases protegidas
          por direitos autorais etc) e se responsabiliza pelo conteúdo. Posts denunciados podem ser
          removidos sem aviso.
        </P>
      </Section>

      <Section title="6. Inteligência artificial">
        <P>
          A IA gera <Strong>sugestões</Strong> de treino baseadas no perfil que você forneceu.
          Algumas ressalvas importantes:
        </P>
        <List items={[
          <>As sugestões <Strong>podem conter erros</Strong>. Sempre revise antes de aplicar.</>,
          <>A IA não substitui educador físico, médico ou fisioterapeuta.</>,
          <>Treinos gerados consideram dados que você informou — informações imprecisas levam a sugestões piores.</>,
          <>Você é o único responsável pelas decisões que tomar com base nas sugestões.</>,
          <>O plano FREE limita gerações de IA por conta (atualmente 3 totais); planos PRO removem esse limite.</>,
        ]} />
      </Section>

      <Section title="7. Planos e pagamentos">
        <P>
          O {APP_NAME} oferece um plano <Strong>FREE</Strong> (gratuito, com limites) e um plano
          <Strong> PRO</Strong> (sem limites). Atualmente o PRO só é liberado por convite enviado pelo
          administrador. No futuro pode passar a ter cobrança recorrente — quando isso acontecer,
          atualizaremos estes termos e avisaremos os usuários por e-mail ou aviso no app antes de qualquer
          mudança ter efeito.
        </P>
      </Section>

      <Section title="8. Disponibilidade do serviço">
        <P>
          Fazemos o possível pra manter o app no ar, mas <Strong>não garantimos disponibilidade
          ininterrupta</Strong>. Podemos fazer manutenção, mudar funcionalidades ou descontinuar
          recursos. Em descontinuação total, avisaremos com antecedência razoável pra você exportar
          seus dados.
        </P>
      </Section>

      <Section title="9. Limitação de responsabilidade">
        <P>
          Na máxima extensão permitida por lei, o {APP_NAME} <Strong>não se responsabiliza</Strong> por:
        </P>
        <List items={[
          'Lesões ou problemas de saúde decorrentes da prática de exercícios.',
          'Decisões que você tomar com base em sugestões de IA.',
          'Perda de dados causada por falha do seu dispositivo, navegador ou conexão.',
          'Conteúdo publicado por outros usuários.',
          'Falhas de provedores terceiros (Supabase, IA, e-mail, hospedagem).',
        ]} />
        <P>
          Isso não exclui responsabilidades que a lei brasileira (especialmente CDC e LGPD) atribui
          como obrigatórias.
        </P>
      </Section>

      <Section title="10. Suspensão e exclusão pela nossa parte">
        <P>
          Podemos suspender ou excluir sua conta se você violar estes termos ou se houver suspeita
          de fraude. Em casos graves, agimos imediatamente. Em casos menos urgentes, avisamos antes
          de tomar a decisão final.
        </P>
      </Section>

      <Section title="11. Privacidade">
        <P>
          O tratamento dos seus dados é regido pela nossa <Link to="/privacidade" className="text-[var(--brand-strong)] hover:underline">Política de Privacidade</Link>,
          que faz parte destes termos.
        </P>
      </Section>

      <Section title="12. Mudanças nestes termos">
        <P>
          Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou aviso no
          app com pelo menos 7 dias de antecedência. Continuar usando o app após a mudança significa
          aceitar a nova versão.
        </P>
      </Section>

      <Section title="13. Lei aplicável e foro">
        <P>
          Estes termos são regidos pelas leis da <Strong>República Federativa do Brasil</Strong>.
          Conflitos serão resolvidos no foro do domicílio do usuário (para consumidores) ou no foro
          da Comarca em que residimos.
        </P>
      </Section>

      <Section title="14. Contato">
        <P>
          Dúvidas sobre estes termos: <Email>{CONTACT_EMAIL}</Email>.
        </P>
      </Section>

      <footer className="rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)] p-4 text-center">
        <p className="text-[11px] text-[var(--muted)]">
          Documento válido a partir de {LAST_UPDATED}. Ao criar uma conta no SerraAthlo você concorda com estes termos.
        </p>
      </footer>
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">{title}</h2>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-[var(--text)]">
        {children}
      </div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--text)]">{children}</p>
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[var(--text)]">{children}</strong>
}

function Email({ children }: { children: React.ReactNode }) {
  return (
    <a href={`mailto:${children}`} className="font-mono text-[12.5px] text-[var(--brand-strong)] hover:underline">
      {children}
    </a>
  )
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc text-[13.5px] leading-relaxed text-[var(--text)] marker:text-[var(--brand)]">
          {item}
        </li>
      ))}
    </ul>
  )
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/8 p-5 text-[13.5px] leading-relaxed text-[var(--text)] sm:p-6">
      {children}
    </div>
  )
}
