import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';
import { legalEntity } from '@/lib/legal-entity';

// Quem opera a instância vem do ambiente (`LEGAL_ENTITY_*`), lido por requisição.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Termos de Serviço — Fatia',
  description: 'As regras de uso da instância pública do Fatia.',
};

const LAST_UPDATED = '19 de outubro de 2026';

export default function TermsPage() {
  const operador = legalEntity();
  return (
    <LegalDoc title="Termos de Serviço" lastUpdated={LAST_UPDATED}>
      <LegalSection title="O que é o Fatia">
        <p>
          Um app de registro de nutrição e treino, integrável ao Claude. É software livre; o código
          está no <a href="https://github.com/ThiagoCarreiraVallim/fatia">GitHub</a>.
        </p>
        <p>
          Estes termos regem o uso da <strong>instância pública oficial</strong>. Se você
          auto-hospeda, sua relação é com a licença do software, não com estes termos.
        </p>
        {operador ? (
          <p>
            Esta instância é operada por <strong>{operador.name}</strong>
            {operador.document ? <>, CNPJ {operador.document}</> : null}.
          </p>
        ) : null}
      </LegalSection>

      <LegalSection title="Isto não é orientação médica">
        <p>
          <strong>
            O Fatia é uma ferramenta de registro. Não é profissional de saúde e não substitui um.
          </strong>
        </p>
        <p>
          Números de calorias, macros e micronutrientes vêm da tabela TACO e de estimativas —
          incluindo estimativas geradas por IA quando você registra um alimento fora do catálogo.
          São aproximações, podem estar errados, e não devem embasar decisão clínica.
        </p>
        <p>
          Consulte médico ou nutricionista antes de mudar dieta ou rotina de exercícios,
          especialmente se você tem qualquer condição de saúde, está grávida, ou tem histórico de
          transtorno alimentar.
        </p>
      </LegalSection>

      <LegalSection title="Sua conta">
        <ul>
          <li>Você precisa de 18 anos ou mais.</li>
          <li>Uma conta é de uma pessoa. Não compartilhe credenciais.</li>
          <li>Você é responsável pelo que registra e por manter seu acesso seguro.</li>
          <li>Você pode apagar a conta a qualquer momento, sem pedir autorização.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Uso aceitável">
        <p>Não use o Fatia para:</p>
        <ul>
          <li>Acessar conta ou dados de outra pessoa.</li>
          <li>
            Sondar, varrer ou testar a segurança do serviço sem seguir o processo de{' '}
            <a href="https://github.com/ThiagoCarreiraVallim/fatia/blob/main/SECURITY.md">
              SECURITY.md
            </a>
            .
          </li>
          <li>
            Sobrecarregar a infraestrutura. Há limite de 60 requisições por minuto por usuário no
            endpoint MCP; contorná-lo deliberadamente é abuso.
          </li>
          <li>Qualquer finalidade ilegal.</li>
        </ul>
        <p>
          Podemos suspender contas que causem dano ao serviço ou a outros usuários. Sempre que for
          possível avisar antes, avisaremos.
        </p>
      </LegalSection>

      <LegalSection title="Seus dados são seus">
        <p>
          Você mantém a titularidade de tudo que registra. Não reivindicamos licença sobre seu
          conteúdo além do necessário para operar o serviço (armazenar e devolver a você).
        </p>
        <p>
          Você pode exportar tudo em JSON quando quiser — sem pedido formal, sem espera. Ver a{' '}
          <a href="/privacy">Política de Privacidade</a>.
        </p>
      </LegalSection>

      <LegalSection title="Custo e disponibilidade">
        <p>
          A instância pública tem dois planos. O <strong>Free</strong> é gratuito e inclui o app
          inteiro — registro de refeições, treino, água, peso, passos, metas e progresso — e a
          conexão com a sua própria IA pelo MCP, cujo processamento corre na sua assinatura dela.
        </p>
        <p>
          O <strong>PRO</strong> acrescenta a IA hospedada pelo Fatia: chat, ditado e registro de
          refeição por foto. Custa <strong>R$ 19,90 por mês</strong> ou{' '}
          <strong>R$ 179 por ano</strong>, com <strong>renovação automática</strong> ao fim de cada
          período, até você cancelar. Nenhuma função de registro, leitura, exportação ou exclusão
          dos seus dados depende do plano.
        </p>
        <p>
          <strong>Assinatura pela web</strong> (Pix, boleto ou cartão, processados pelo Asaas): você
          cancela em &ldquo;Meu plano&rdquo; quando quiser, e o PRO continua até o fim do período já
          pago. Você tem <strong>7 dias de arrependimento</strong> a partir da contratação (Código
          de Defesa do Consumidor, art. 49): pedindo nesse prazo, devolvemos o valor pago.{' '}
          <strong>Assinatura pelo app</strong>: é feita e cancelada na App Store ou no Google Play,
          e reembolso e arrependimento seguem a política da loja.
        </p>
        <p>
          Se um pagamento atrasar, o PRO continua por <strong>7 dias de carência</strong>; depois a
          conta volta ao Free, sem perder nenhum dado. A IA hospedada tem também um{' '}
          <strong>limite diário de uso</strong>, inclusive no PRO: ao atingi-lo, ela fica
          indisponível até o dia seguinte e o registro manual continua funcionando normalmente.
        </p>
        <p>
          <strong>PRO pago por uma comunidade:</strong> uma academia ou um treinador pode comprar
          assentos e dar o PRO a quem escolher. Enquanto o assento for seu, a cobrança é da
          comunidade, não sua. Ela pode retirar o assento a qualquer momento, e se deixar de pagar
          ele vale até o fim da carência; nos dois casos você volta ao Free sem perder nenhum dado.
          Se você já assina o PRO, a sua assinatura continua valendo e não é cancelada.
        </p>
        <p>
          Em contrapartida, e sendo direto: <strong>não há SLA.</strong> É um projeto mantido por
          uma pessoa. O serviço pode ficar indisponível, ter janelas de manutenção, ou — em último
          caso — ser descontinuado. Se isso acontecer, avisaremos no repositório com antecedência
          para você exportar seus dados. E como o software é livre, você sempre pode subir sua
          própria instância.
        </p>
      </LegalSection>

      <LegalSection title="Limitação de responsabilidade">
        <p>
          O serviço é fornecido &ldquo;como está&rdquo;, sem garantias. Na extensão permitida pela
          lei, não respondemos por danos indiretos, perda de dados ou decisões tomadas com base em
          informações do app.
        </p>
        <p>
          Isto não afasta direitos que a legislação brasileira garanta a você e não possam ser
          renunciados por contrato.
        </p>
      </LegalSection>

      <LegalSection title="Integração com o Claude">
        <p>
          Conectar o Fatia ao Claude é opcional. Ao conectar, você autoriza o Claude a ler e
          escrever seus dados do Fatia em seu nome, com o escopo concedido no consentimento.
        </p>
        <p>
          Você pode revogar esse acesso a qualquer momento removendo o conector no Claude. Sua conta
          e seus dados continuam no Fatia.
        </p>
        <p>
          O Claude é um produto da Anthropic e não é operado por nós. O uso dele é regido pelos
          termos da Anthropic.
        </p>
      </LegalSection>

      <LegalSection title="IA hospedada pelo Fatia">
        <p>
          Diferente do item acima: aqui é o Fatia que chama um provedor de modelo, para reconhecer
          uma foto ou um áudio sem exigir que você tenha assinatura de IA.{' '}
          <strong>Esta função ainda não está disponível na instância pública.</strong>
        </p>
        <p>
          Quando existir, será <strong>opcional</strong> e dependerá de consentimento específico
          seu, separado do aceite destes termos — porque o caminho manual não usa IA nenhuma, e quem
          não quiser usar não precisa consentir com nada. Você pode revogar quando quiser, sem
          perder conta nem histórico. O que sai do seu aparelho, o que não sai e quem recebe estão
          detalhados na <a href="/privacy">Política de Privacidade</a>.
        </p>
        <p>
          Resultado de IA é <strong>estimativa</strong>. Um modelo pode identificar o alimento
          errado ou errar a porção. Confira antes de registrar, e releia a seção{' '}
          <strong>Isto não é orientação médica</strong> acima.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nestes termos">
        <p>
          Alterações materiais serão anunciadas no repositório. O histórico completo está no Git e é
          auditável.
        </p>
      </LegalSection>

      <LegalSection title="Lei aplicável">
        <p>
          Legislação brasileira, incluindo a LGPD (Lei 13.709/2018) e o Marco Civil da Internet (Lei
          12.965/2014).
        </p>
      </LegalSection>

      <LegalSection title="Contato">
        <p>
          Pelas <a href="https://github.com/ThiagoCarreiraVallim/fatia/issues">issues do GitHub</a>{' '}
          ou pelo e-mail de suporte publicado no repositório.
          {operador?.dpoEmail ? (
            <>
              {' '}
              Sobre os seus dados pessoais, o encarregado (DPO) atende em{' '}
              <a href={`mailto:${operador.dpoEmail}`}>{operador.dpoEmail}</a>.
            </>
          ) : null}
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
