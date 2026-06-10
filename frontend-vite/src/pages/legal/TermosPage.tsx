import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Email, Highlight, LegalDocLayout, List, P, Strong, type LegalSection } from './LegalDocLayout'

// Termos de Uso — adaptado pro SerraAthlo, fitness + IA + social. NÃO É
// CONSELHO JURÍDICO; se monetizar ou crescer vale revisão por advogado.

const LAST_UPDATED = '10/06/2026'
const CONTACT_EMAIL = 'pedrovasco98765@gmail.com'
const MIN_AGE = 14
const APP_NAME = 'SerraAthlo'

const INTRO = (
  <Highlight>
    ⚠️ <Strong>Importante (saúde):</Strong> o {APP_NAME} é uma ferramenta de organização e
    sugestão de treinos. Ele <Strong>não substitui</Strong> a orientação de educador físico,
    médico ou fisioterapeuta. Antes de iniciar ou alterar significativamente seu programa
    de exercícios, especialmente se você tem condições de saúde preexistentes, consulte um
    profissional qualificado.
  </Highlight>
)

const SECTIONS: LegalSection[] = [
  {
    id: 'quem-oferece',
    number: '1',
    title: 'Quem oferece o serviço',
    body: (
      <P>
        O {APP_NAME} é desenvolvido e mantido por um desenvolvedor independente, identificado
        neste documento como <Strong>"nós"</Strong>. Contato: <Email>{CONTACT_EMAIL}</Email>.
      </P>
    ),
  },
  {
    id: 'sobre',
    number: '2',
    title: 'O que é o SerraAthlo',
    body: (
      <>
        <P>Uma plataforma pra planejar, registrar e acompanhar treinos físicos, com recursos de:</P>
        <List
          items={[
            'Criação manual de rotinas e exercícios personalizados.',
            'Geração de treinos por inteligência artificial baseada nos seus dados.',
            'Acompanhamento de progresso (peso, medidas, sessões concluídas).',
            'Feed social pra compartilhar treinos com pessoas que você segue.',
            'Competições entre usuários.',
            'Planos PRO/FREE com diferentes limites de uso.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'cadastro',
    number: '3',
    title: 'Conta e cadastro',
    body: (
      <List
        items={[
          <>Você precisa ter <Strong>{MIN_AGE} anos ou mais</Strong> pra criar uma conta. Se for menor, precisa de autorização dos responsáveis.</>,
          <>Os dados que você fornecer devem ser <Strong>verdadeiros</Strong>. Conta com dados falsos pode ser suspensa sem aviso.</>,
          <>Você é responsável pela segurança da sua senha. Use senha forte e não compartilhe.</>,
          <>Uma conta por pessoa. Contas duplicadas podem ser excluídas.</>,
          <>Você pode excluir sua conta a qualquer momento em <Strong>Configurações &gt; Excluir conta</Strong>.</>,
        ]}
      />
    ),
  },
  {
    id: 'uso-aceitavel',
    number: '4',
    title: 'Uso aceitável',
    body: (
      <>
        <P>Ao usar o {APP_NAME}, você concorda em <Strong>NÃO</Strong>:</P>
        <List
          items={[
            'Usar robôs, scripts ou meios automatizados pra interagir com o app.',
            'Tentar burlar limites do plano FREE com várias contas.',
            'Atacar a integridade técnica do app (DDoS, scraping massivo, exploits).',
            'Publicar conteúdo ilegal, racista, sexual, violento ou que assedie outras pessoas.',
            'Impersonar terceiros (criar conta como se fosse outra pessoa).',
            'Coletar dados de outros usuários sem o consentimento deles.',
            'Vender, sublicenciar ou redistribuir o serviço.',
          ]}
        />
        <P>
          Violar essas regras pode resultar em suspensão ou exclusão da conta sem reembolso,
          além de eventuais medidas legais cabíveis.
        </P>
      </>
    ),
  },
  {
    id: 'conteudo',
    number: '5',
    title: 'Conteúdo que você publica',
    body: (
      <>
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
      </>
    ),
  },
  {
    id: 'ia',
    number: '6',
    title: 'Inteligência artificial',
    body: (
      <>
        <P>
          A IA gera <Strong>sugestões</Strong> de treino baseadas no perfil que você forneceu.
          Algumas ressalvas importantes:
        </P>
        <List
          items={[
            <>As sugestões <Strong>podem conter erros</Strong>. Sempre revise antes de aplicar.</>,
            <>A IA não substitui educador físico, médico ou fisioterapeuta.</>,
            <>Treinos gerados consideram dados que você informou — informações imprecisas levam a sugestões piores.</>,
            <>Você é o único responsável pelas decisões que tomar com base nas sugestões.</>,
            <>O plano FREE limita gerações de IA por conta (atualmente 3 totais); planos PRO removem esse limite.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'planos',
    number: '7',
    title: 'Planos e pagamentos',
    body: (
      <P>
        O {APP_NAME} oferece um plano <Strong>FREE</Strong> (gratuito, com limites) e um plano <Strong> PRO</Strong>
        {' '}(sem limites). Atualmente o PRO só é liberado por convite enviado pelo administrador. No futuro
        pode passar a ter cobrança recorrente — quando isso acontecer, atualizaremos estes termos e avisaremos
        os usuários por e-mail ou aviso no app antes de qualquer mudança ter efeito.
      </P>
    ),
  },
  {
    id: 'disponibilidade',
    number: '8',
    title: 'Disponibilidade do serviço',
    body: (
      <P>
        Fazemos o possível pra manter o app no ar, mas <Strong>não garantimos disponibilidade
        ininterrupta</Strong>. Podemos fazer manutenção, mudar funcionalidades ou descontinuar
        recursos. Em descontinuação total, avisaremos com antecedência razoável pra você exportar
        seus dados.
      </P>
    ),
  },
  {
    id: 'responsabilidade',
    number: '9',
    title: 'Limitação de responsabilidade',
    body: (
      <>
        <P>
          Na máxima extensão permitida por lei, o {APP_NAME} <Strong>não se responsabiliza</Strong> por:
        </P>
        <List
          items={[
            'Lesões ou problemas de saúde decorrentes da prática de exercícios.',
            'Decisões que você tomar com base em sugestões de IA.',
            'Perda de dados causada por falha do seu dispositivo, navegador ou conexão.',
            'Conteúdo publicado por outros usuários.',
            'Falhas de provedores terceiros (Supabase, IA, e-mail, hospedagem).',
          ]}
        />
        <P>
          Isso não exclui responsabilidades que a lei brasileira (especialmente CDC e LGPD) atribui
          como obrigatórias.
        </P>
      </>
    ),
  },
  {
    id: 'suspensao',
    number: '10',
    title: 'Suspensão e exclusão pela nossa parte',
    body: (
      <P>
        Podemos suspender ou excluir sua conta se você violar estes termos ou se houver suspeita
        de fraude. Em casos graves, agimos imediatamente. Em casos menos urgentes, avisamos antes
        de tomar a decisão final.
      </P>
    ),
  },
  {
    id: 'privacidade',
    number: '11',
    title: 'Privacidade',
    body: (
      <P>
        O tratamento dos seus dados é regido pela nossa{' '}
        <Link to="/privacidade" className="text-[var(--brand-strong)] hover:underline">
          Política de Privacidade
        </Link>
        , que faz parte destes termos.
      </P>
    ),
  },
  {
    id: 'mudancas',
    number: '12',
    title: 'Mudanças nestes termos',
    body: (
      <P>
        Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou aviso no
        app com pelo menos 7 dias de antecedência. Continuar usando o app após a mudança significa
        aceitar a nova versão.
      </P>
    ),
  },
  {
    id: 'foro',
    number: '13',
    title: 'Lei aplicável e foro',
    body: (
      <P>
        Estes termos são regidos pelas leis da <Strong>República Federativa do Brasil</Strong>.
        Conflitos serão resolvidos no foro do domicílio do usuário (pra consumidores) ou no foro
        da Comarca em que residimos.
      </P>
    ),
  },
  {
    id: 'contato',
    number: '14',
    title: 'Contato',
    body: (
      <P>
        Dúvidas sobre estes termos: <Email>{CONTACT_EMAIL}</Email>.
      </P>
    ),
  },
]

export function TermosPage() {
  return (
    <LegalDocLayout
      title={<>Termos de <span className="font-serif-accent italic text-[var(--brand-strong)]">Uso</span></>}
      subtitle={`Estes termos regulam o uso do aplicativo ${APP_NAME}. Ao criar conta e usar o serviço, você concorda com tudo o que está aqui. Leia com calma — escrevemos sem juridiquês.`}
      lastUpdated={LAST_UPDATED}
      icon={<FileText size={12} />}
      intro={INTRO}
      sections={SECTIONS}
      footerNote={`Documento válido a partir de ${LAST_UPDATED}. Ao criar uma conta no ${APP_NAME} você concorda com estes termos.`}
    />
  )
}
