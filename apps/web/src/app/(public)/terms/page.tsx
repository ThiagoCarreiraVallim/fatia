import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';

export const metadata: Metadata = {
  title: 'Termos de Serviço — Fatia',
  description: 'As regras de uso da instância pública do Fatia.',
};

const LAST_UPDATED = '3 de agosto de 2026';

export default function TermsPage() {
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
          A instância pública é <strong>gratuita</strong>. Não há plano pago, e nenhum custo de IA é
          cobrado de você: o processamento do Claude corre na sua própria assinatura.
        </p>
        <p>
          Se a IA hospedada pelo Fatia for ativada na sua conta, quem paga a inferência é o projeto,
          e não você. Por isso ela tem <strong>limite diário de uso</strong>. Ao atingir o limite, a
          função de IA fica indisponível até o dia seguinte e o registro manual continua funcionando
          normalmente —{' '}
          <strong>em nenhuma hipótese isso vira cobrança ou oferta de plano pago</strong>. O limite
          é uma contenção de custo do projeto, não um funil de vendas.
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
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
