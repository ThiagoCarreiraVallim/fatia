import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Fatia',
  description: 'Quais dados o Fatia coleta, por quê, e como você exerce seus direitos.',
};

/** Atualizar sempre que o conteúdo mudar de forma material. */
const LAST_UPDATED = '2 de agosto de 2026';

export default function PrivacyPage() {
  return (
    <LegalDoc title="Política de Privacidade" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Resumo">
        <p>
          O Fatia registra o que você come e treina para você acompanhar seu progresso. Nada disso é
          vendido, compartilhado com terceiros ou usado para publicidade.
        </p>
        <p>
          O Fatia é software livre e pode ser auto-hospedado. Esta política cobre a{' '}
          <strong>instância pública oficial</strong>. Se você usa uma instância própria, quem
          responde pelos dados é quem a opera.
        </p>
      </LegalSection>

      <LegalSection title="Quem é o controlador">
        <p>
          O mantenedor do projeto Fatia, responsável pela instância pública. Contato pelas{' '}
          <a href="https://github.com/ThiagoCarreiraVallim/fatia/issues">issues do GitHub</a> ou
          pelo e-mail de suporte publicado no repositório.
        </p>
      </LegalSection>

      <LegalSection title="Quais dados coletamos">
        <p>Somente o que você registra, mais o mínimo necessário para autenticar:</p>
        <ul>
          <li>
            <strong>Identificação:</strong> e-mail e nome, vindos do provedor de login. Não
            armazenamos sua senha — a autenticação é feita pelo Logto.
          </li>
          <li>
            <strong>Perfil:</strong> altura e fuso horário, se você informar.
          </li>
          <li>
            <strong>Nutrição:</strong> refeições, alimentos, quantidades, macros e micronutrientes;
            metas nutricionais.
          </li>
          <li>
            <strong>Treino:</strong> planos, sessões, exercícios, cargas, repetições e tempos.
          </li>
          <li>
            <strong>Progresso:</strong> peso corporal, passos, hidratação e metas pessoais.
          </li>
        </ul>
        <p>
          Dados de saúde são <strong>dados pessoais sensíveis</strong> pela LGPD (art. 5º, II). A
          base legal para tratá-los é o seu <strong>consentimento</strong>, dado ao criar a conta e
          registrar informações — e revogável a qualquer momento apagando a conta.
        </p>
        <p>
          Se você entra numa academia dentro do Fatia, o consentimento passa a ter um segundo nível,
          e ele é <strong>por categoria e por profissional</strong>: você autoriza este personal a
          ver seu treino sem que ele veja sua alimentação, e sem que o nutricionista da mesma
          academia veja qualquer uma das duas. Nada é compartilhado por padrão — entrar num grupo
          não autoriza ninguém a ver nada, e o dono da academia não vê dado de saúde de aluno em
          nenhuma hipótese. Você pode ver quem tem acesso, mudar as categorias e cortar o acesso a
          qualquer momento, pelo app ou pedindo ao Claude. Cortar vale a partir da próxima
          requisição do profissional — não é &ldquo;instantâneo&rdquo;, é uma requisição.
        </p>
        <p>
          Toda leitura dos seus dados por um profissional fica <strong>registrada</strong>,
          inclusive as tentativas <em>barradas</em>, e você lê esse registro quando quiser. O
          registro guarda que houve leitura — data, categoria e quem — e nunca o conteúdo lido.
        </p>
      </LegalSection>

      <LegalSection title="O que NÃO coletamos">
        <ul>
          <li>
            <strong>Fotos.</strong> Se você fotografa uma refeição para o Claude analisar, a imagem
            nunca chega ao Fatia — só o texto do resultado. Não há armazenamento de imagens.
          </li>
          <li>
            <strong>Senhas.</strong> Ficam no provedor de identidade, não conosco.
          </li>
          <li>
            <strong>Meios de pagamento.</strong> A instância pública é gratuita.
          </li>
          <li>
            <strong>Localização, contatos, agenda</strong> ou qualquer dado do seu dispositivo além
            do que você digita.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies e rastreamento">
        <p>
          <strong>Não usamos analytics, pixels de rastreamento nem cookies de publicidade.</strong>{' '}
          Não há Google Analytics, Meta Pixel ou equivalente.
        </p>
        <p>O único cookie é o de sessão, estritamente necessário:</p>
        <ul>
          <li>
            <strong>Cookie de sessão</strong> — mantém você logado. Criptografado,{' '}
            <code>httpOnly</code>, enviado apenas para o próprio domínio. Sem ele não há como usar o
            app logado.
          </li>
        </ul>
        <p>
          Como não há cookie não-essencial, não existe banner de consentimento de cookies a exibir.
        </p>
      </LegalSection>

      <LegalSection title="Inteligência artificial">
        <p>
          O Fatia se integra ao Claude via MCP, mas <strong>não</strong> envia seus dados para
          nenhum provedor de IA por conta própria. Não há chave de API de LLM no servidor.
        </p>
        <p>
          Quando você conversa com o Claude sobre suas refeições ou treinos, é o <em>seu</em> Claude
          — sua conta, sua assinatura — que chama as ferramentas do Fatia. O tratamento dessa
          conversa é regido pela política de privacidade da Anthropic, não por esta.
        </p>
      </LegalSection>

      <LegalSection title="Com quem compartilhamos">
        <p>Ninguém, para fins próprios. Os únicos terceiros envolvidos na operação são:</p>
        <ul>
          <li>
            <strong>Provedor de identidade (Logto)</strong> — autenticação. Recebe e-mail e senha,
            não recebe seus dados de saúde.
          </li>
          <li>
            <strong>Provedor de infraestrutura</strong> — hospeda o servidor e o banco.
          </li>
          <li>
            <strong>Open Food Facts</strong> — consultado quando você escaneia o código de barras de
            um produto no aplicativo. Recebe <strong>apenas o número do código de barras</strong>:
            sem token, sem cookie, sem identificador seu e sem nada do que você registrou. Do lado
            deles a consulta é indistinguível de uma anônima, e a imagem da câmera nunca sai do seu
            aparelho.
          </li>
        </ul>
        <p>
          Não vendemos, alugamos nem cedemos dados. Só entregamos algo a autoridade pública mediante
          ordem judicial válida.
        </p>
      </LegalSection>

      <LegalSection title="Por quanto tempo guardamos">
        <p>
          Enquanto sua conta existir. Ao apagar a conta, todos os dados vinculados a ela são
          removidos do banco imediatamente, em cascata.
        </p>
        <p>
          Detalhes de retenção, do que é registrado em log e do que <em>não</em> é: veja{' '}
          <a href="https://github.com/ThiagoCarreiraVallim/fatia/blob/main/docs/DATA_RETENTION.md">
            docs/DATA_RETENTION.md
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Créditos de dados de terceiros">
        <p>
          Os dados de produtos embalados lidos pelo scanner de código de barras vêm do{' '}
          <a href="https://world.openfoodfacts.org">Open Food Facts</a>, uma base colaborativa e
          aberta, disponibilizada sob a licença{' '}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/">
            Open Database License (ODbL) 1.0
          </a>
          . A ficha de cada produto também é creditada na tela onde ela aparece, com link para a
          origem — que é por onde qualquer pessoa pode corrigir um rótulo errado.
        </p>
        <p>
          A tabela de alimentos in natura é a TACO (Unicamp). Nenhuma das duas bases recebe dados
          seus.
        </p>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>Pela LGPD (art. 18) você pode, a qualquer momento:</p>
        <ul>
          <li>
            <strong>Acessar e portar</strong> seus dados — exporte tudo em JSON pelo endpoint{' '}
            <code>GET /users/me/export</code> ou pedindo ao Claude (&ldquo;exporte meus dados do
            Fatia&rdquo;).
          </li>
          <li>
            <strong>Corrigir</strong> qualquer registro — o app e o Claude editam tudo.
          </li>
          <li>
            <strong>Eliminar</strong> a conta e todos os dados — <code>DELETE /users/me</code> ou
            pedindo ao Claude. É irreversível e exige confirmação explícita.
          </li>
          <li>
            <strong>Revogar o consentimento</strong> — para um profissional de academia, cortando o
            acesso dele sem apagar nada seu. Para o tratamento como um todo, apagar a conta é a
            forma direta.
          </li>
          <li>
            <strong>Saber quem acessou</strong> — a lista de quem pode ver o quê, e o registro de
            cada leitura feita por um profissional, tentativas barradas incluídas.
          </li>
        </ul>
        <p>
          Todos estão disponíveis sem intermediário: você não precisa abrir um pedido nem esperar
          resposta.
        </p>
      </LegalSection>

      <LegalSection title="Segurança">
        <p>
          Todo tráfego usa HTTPS. Toda requisição exige token válido, e cada consulta ao banco é
          escopada ao seu usuário. A <em>única</em> exceção é o profissional que você autorizou, na
          categoria que você autorizou — e ela passa por um único ponto do código, auditado e
          registrado. O modelo de ameaças e as camadas de defesa são públicos em{' '}
          <a href="https://github.com/ThiagoCarreiraVallim/fatia/blob/main/docs/THREAT_MODEL.md">
            docs/THREAT_MODEL.md
          </a>
          , incluindo o que <em>não</em> está protegido.
        </p>
        <p>
          Nenhum sistema é imune. Se identificar uma vulnerabilidade, veja{' '}
          <a href="https://github.com/ThiagoCarreiraVallim/fatia/blob/main/SECURITY.md">
            SECURITY.md
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Menores de idade">
        <p>
          O Fatia não é destinado a menores de 18 anos. Não coletamos intencionalmente dados de
          menores. Se isso ocorreu, entre em contato para removermos.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nesta política">
        <p>
          Alterações materiais serão anunciadas no repositório. O histórico completo de alterações
          desta página está no Git — o que é uma vantagem de o projeto ser aberto: você pode auditar
          exatamente o que mudou e quando.
        </p>
      </LegalSection>
    </LegalDoc>
  );
}
