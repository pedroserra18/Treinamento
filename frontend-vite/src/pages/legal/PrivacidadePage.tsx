import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

// Política de privacidade — texto base LGPD-compliant adaptado pro SerraAthlo
// (fitness, IA generativa, social). NÃO É CONSELHO JURÍDICO; se o app crescer
// ou monetizar de verdade, vale ter um advogado revisando.
//
// Padrão Documento: lead com data, depois cada cláusula numerada. Linguagem
// simples (LGPD valoriza isso) sem juridiquês desnecessário.
const LAST_UPDATED = '10/06/2026'
const DPO_EMAIL = 'pedrovasco98765@gmail.com'
const MIN_AGE = 14

export function PrivacidadePage() {
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
          <ShieldCheck size={12} />
          Documento legal
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          Política de <span className="font-serif-accent italic text-[var(--brand-strong)]">Privacidade</span>
        </h1>
        <p className="mt-3 text-[13px] text-[var(--muted)]">
          Esta política descreve como o SerraAthlo coleta, usa e protege seus dados pessoais,
          em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
        </p>
        <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">Última atualização: {LAST_UPDATED}</p>
      </header>

      <Section title="1. Quem somos">
        <P>
          O <Strong>SerraAthlo</Strong> é um aplicativo de treino que ajuda você a planejar, registrar e
          acompanhar suas atividades físicas, com recursos de inteligência artificial para gerar treinos
          personalizados e funcionalidades sociais para compartilhar progresso com outros usuários.
        </P>
        <P>
          O responsável pelo tratamento dos seus dados é o <Strong>desenvolvedor do SerraAthlo</Strong>,
          que atua como controlador no contexto da LGPD. Para dúvidas, pedidos ou reclamações relacionados
          à sua privacidade, escreva para <Email>{DPO_EMAIL}</Email>.
        </P>
      </Section>

      <Section title="2. Dados que coletamos">
        <P>Coletamos apenas o necessário pra o funcionamento do aplicativo:</P>
        <List items={[
          <><Strong>Cadastro:</Strong> nome, e-mail, handle público (@), senha (armazenada como hash bcrypt — nunca em texto puro).</>,
          <><Strong>Perfil de treino:</Strong> data de nascimento, sexo, peso, altura, nível de experiência e objetivos. Esses dados são considerados sensíveis pela LGPD e usados apenas pra personalizar suas recomendações de treino.</>,
          <><Strong>Foto de perfil:</Strong> opcional, hospedada no Supabase Storage.</>,
          <><Strong>Atividade no app:</Strong> rotinas e treinos criados, sessões registradas, exercícios personalizados, gerações de treino por IA, interações sociais (posts, comentários, seguidores), participação em competições.</>,
          <><Strong>Comunicação com IA:</Strong> as preferências que você informa pra gerar treinos (objetivo, dias por semana, equipamentos, etc) são enviadas pro provedor de IA pra produzir a sugestão.</>,
          <><Strong>Dados técnicos:</Strong> endereço IP, agente de navegador, tipo de dispositivo, sistema operacional — usados pra segurança e prevenção de fraude.</>,
          <><Strong>Push notifications:</Strong> ao aceitar receber notificações, armazenamos o endpoint do seu dispositivo pra enviar avisos (lembrete de treino, descanso, etc).</>,
        ]} />
      </Section>

      <Section title="3. Por que usamos seus dados">
        <List items={[
          <><Strong>Funcionamento do app:</Strong> sem login, sem treino salvo, sem feed.</>,
          <><Strong>Personalização por IA:</Strong> seus dados de perfil ajudam a IA a gerar treinos mais adequados pra você.</>,
          <><Strong>Comunicação:</Strong> e-mails transacionais (verificação de cadastro, recuperação de senha, alterações importantes) e push notifications opcionais.</>,
          <><Strong>Estatísticas:</Strong> métricas agregadas e anonimizadas pra entender o uso geral do app — sem identificar você individualmente.</>,
          <><Strong>Segurança e auditoria:</Strong> detectar atividades suspeitas, contas de spam e cumprir obrigações legais.</>,
        ]} />
      </Section>

      <Section title="4. Base legal (LGPD art. 7º)">
        <List items={[
          <><Strong>Consentimento:</Strong> ao criar conta, você aceita estes termos. Você pode revogar a qualquer momento excluindo a conta.</>,
          <><Strong>Execução de contrato:</Strong> dados necessários pra prestar o serviço (login, treinos, etc).</>,
          <><Strong>Interesse legítimo:</Strong> segurança, prevenção de fraude e melhorias do produto.</>,
          <><Strong>Cumprimento de obrigação legal:</Strong> manutenção de registros que a lei exigir.</>,
        ]} />
      </Section>

      <Section title="5. Com quem compartilhamos">
        <P>
          Não vendemos seus dados. Compartilhamos apenas com provedores que tornam o SerraAthlo possível,
          todos contratualmente comprometidos com segurança:
        </P>
        <List items={[
          <><Strong>Supabase</Strong> (banco de dados e armazenamento de fotos) — hospedado em AWS.</>,
          <><Strong>Render</Strong> (servidor da API) e <Strong>Vercel</Strong> (interface web).</>,
          <><Strong>Anthropic</Strong> (modelo de IA) — recebe as preferências de treino que você fornece pra geração; não recebe seu nome, e-mail ou foto.</>,
          <><Strong>Provedores de e-mail</Strong> — pra envio de e-mails transacionais.</>,
          <><Strong>Sentry</Strong> (monitoramento de erros) — recebe logs técnicos pra ajudar a corrigir bugs.</>,
        ]} />
        <P>
          Conteúdo público que você publica (handle, posts no feed, comentários) fica visível pros demais usuários
          conforme as configurações de privacidade que você definir.
        </P>
      </Section>

      <Section title="6. Por quanto tempo guardamos">
        <P>
          Seus dados ficam armazenados enquanto sua conta existir. Ao excluir a conta nas configurações,
          removemos seus dados pessoais do banco principal. Alguns registros podem ser mantidos por mais
          tempo se a lei exigir (ex.: registros fiscais, logs de segurança).
        </P>
      </Section>

      <Section title="7. Seus direitos (LGPD art. 18)">
        <P>Você pode, a qualquer momento:</P>
        <List items={[
          <><Strong>Acessar</Strong> os dados que temos sobre você.</>,
          <><Strong>Corrigir</Strong> informações erradas ou desatualizadas.</>,
          <><Strong>Exportar</Strong> seus dados (em Configurações &gt; Exportar dados).</>,
          <><Strong>Excluir</Strong> sua conta e dados (em Configurações &gt; Excluir conta).</>,
          <><Strong>Revogar consentimento</Strong> a qualquer momento.</>,
          <><Strong>Solicitar informações</Strong> sobre uso, compartilhamento e tratamento dos dados.</>,
          <><Strong>Reclamar</Strong> à ANPD (Autoridade Nacional de Proteção de Dados).</>,
        ]} />
        <P>
          Pra exercer esses direitos, mande um e-mail para <Email>{DPO_EMAIL}</Email>.
          Respondemos em até 15 dias.
        </P>
      </Section>

      <Section title="8. Segurança">
        <P>
          Aplicamos boas práticas de segurança: senhas armazenadas como hash, tokens JWT com rotação,
          comunicação por HTTPS, controle de acesso por papel. Mesmo assim, nenhum sistema é 100% seguro —
          recomendamos usar senha forte e ativar 2FA quando disponível.
        </P>
      </Section>

      <Section title="9. Cookies e armazenamento local">
        <P>
          Usamos <Strong>localStorage</Strong> e <Strong>sessionStorage</Strong> pra guardar seu token
          de autenticação e preferências do app (tema, configurações de notificação). Não usamos cookies
          de rastreamento de terceiros.
        </P>
      </Section>

      <Section title="10. Crianças e adolescentes">
        <P>
          O SerraAthlo é destinado a usuários com <Strong>{MIN_AGE} anos ou mais</Strong>. Se você é
          responsável por um adolescente e descobriu que ele criou conta sem o seu conhecimento,
          entre em contato pra que possamos remover a conta.
        </P>
      </Section>

      <Section title="11. Inteligência artificial">
        <P>
          A IA gera <Strong>sugestões</Strong> de treino baseadas nas informações que você fornece. As
          sugestões <Strong>não substituem orientação profissional</Strong> (educador físico, médico,
          fisioterapeuta). Antes de iniciar qualquer programa de exercícios, consulte um profissional
          de saúde, especialmente se você tem condições preexistentes.
        </P>
      </Section>

      <Section title="12. Mudanças nesta política">
        <P>
          Atualizamos esta política quando necessário. Mudanças relevantes serão comunicadas por e-mail
          ou por aviso dentro do aplicativo, com antecedência mínima de 7 dias.
        </P>
      </Section>

      <Section title="13. Contato">
        <P>
          Dúvidas, solicitações ou reclamações sobre privacidade: <Email>{DPO_EMAIL}</Email>.
        </P>
      </Section>

      <footer className="rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)] p-4 text-center">
        <p className="text-[11px] text-[var(--muted)]">
          Documento válido a partir de {LAST_UPDATED}. Ao usar o SerraAthlo você concorda com esta política.
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
