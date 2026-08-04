import type { Metadata } from 'next';
import { LegalDoc, LegalSection } from '@/components/legal-doc';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Fatia',
  description: 'Quais dados o Fatia coleta, por quê, e como você exerce seus direitos.',
};

/** Atualizar sempre que o conteúdo mudar de forma material. */
const LAST_UPDATED = '3 de agosto de 2026';

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
          qualquer momento, pedindo ao Claude. Cortar vale a partir da próxima requisição do
          profissional — não é &ldquo;instantâneo&rdquo;, é uma requisição.
        </p>
        <p>
          A academia pode ver <strong>estatísticas agregadas</strong> — quantas pessoas treinam de
          manhã, como a frequência do grupo variou no mês. Você entra nessa contagem só se{' '}
          <strong>ativar a participação</strong>, que vem desligada, e ela é diferente de autorizar
          um profissional: ninguém passa a ver nada seu, você passa a fazer parte de um número. Só
          entram dados de <strong>engajamento</strong> — frequência, horário, tempo desde o último
          treino. Peso, medidas e alimentação não entram nessa conta, em hipótese alguma.
        </p>
        <p>
          E um número só aparece se houver gente suficiente por trás dele: recortes com menos de
          cinco pessoas são omitidos — junto com os vizinhos que forem necessários para que o que
          sobrou escondido não possa ser deduzido por subtração. A academia escolhe entre recortes
          prontos; ela não monta o próprio filtro, não existe recorte por idade ou sexo, e os
          rótulos vêm de uma lista nossa — nunca de um texto que você escreveu. A metodologia
          completa, com o que ela <em>não</em> protege, está publicada em{' '}
          <a href="https://github.com/ThiagoCarreiraVallim/fatia/blob/main/docs/AGGREGATION_POLICY.md">
            docs/AGGREGATION_POLICY.md
          </a>{' '}
          — é para ser conferida, não para ser acreditada.
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
            <strong>Fotos.</strong> Nenhuma imagem é armazenada — não há banco de fotos, nem em
            disco, nem em cache. Se você usa o <strong>reconhecimento de refeição por foto</strong>{' '}
            no aplicativo, a imagem <em>transita</em> pelo servidor do Fatia e segue para um
            provedor de visão, sem os metadados (veja abaixo); ela não é gravada em lugar nenhum e
            não fica vinculada a você. Se você fotografa uma refeição no seu próprio Claude, a
            imagem não passa pelo Fatia em momento algum.
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
          Existem <strong>dois caminhos</strong> de IA no Fatia, e eles tratam seus dados de formas
          bem diferentes. Ler os dois é o único jeito de saber o que acontece com a sua foto.
        </p>

        <p>
          <strong>1. A sua IA, pelo conector (é como o Fatia funciona hoje).</strong> Você liga o
          Claude à sua conta do Fatia e conversa. Quem lê a foto do prato é o <em>seu</em> Claude —
          sua conta, sua assinatura —, e o Fatia recebe só o resultado já em texto. A imagem{' '}
          <strong>nunca chega até nós</strong>. Esse tratamento é regido pela política de
          privacidade da Anthropic, não por esta.
        </p>

        <p>
          <strong>2. A IA hospedada pelo Fatia.</strong> Reconhecer a foto ou o áudio sem você
          precisar de uma assinatura de IA própria. Para isso o conteúdo precisa sair do seu
          aparelho e chegar a um provedor de modelo, através do{' '}
          <strong>Cloudflare AI Gateway</strong>.{' '}
          <strong>
            Esta segunda opção ainda não está disponível para nenhum usuário da instância pública.
          </strong>{' '}
          Ela só será ativada com consentimento específico seu, e este texto será atualizado com o
          nome do provedor de modelo antes disso.
        </p>

        <p>Quando ela existir, valem as regras abaixo — todas verificáveis no código aberto:</p>
        <ul>
          <li>
            <strong>Consentimento separado e específico.</strong> Não vem embutido no aceite geral
            nem no cadastro. Quem nunca usar IA hospedada nunca precisa consentir com nada, porque o
            registro manual não usa IA alguma. Você pode revogar depois, e a revogação vale para a
            próxima chamada.
          </li>
          <li>
            <strong>O Fatia não guarda nada no caminho.</strong> A imagem e o áudio existem em
            memória durante a requisição e somem com ela: não há bucket, não há disco, não há
            coluna. Isso vale para o que <em>nós</em> operamos, e é verificável no código aberto.
          </li>
          <li>
            <strong>O gateway é instruído, a cada chamada, a não registrar o conteúdo.</strong> O
            Cloudflare AI Gateway grava corpo de requisição e de resposta <em>por padrão</em> —
            registrar é o serviço que ele vende. Toda chamada do Fatia leva o cabeçalho{' '}
            <code>cf-aig-collect-log: false</code>, que desliga esse registro para aquela chamada.
            Está no código, e não numa caixa marcada no painel de alguém: a diferença é que uma
            promessa que depende de configuração de painel ninguém consegue conferir, e esta some do
            repositório se for removida.
          </li>
          <li>
            <strong>Do provedor de modelo, quem responde é o contrato.</strong> Não temos como
            executar código dentro dele, então não afirmamos aqui o que ele faz — afirmamos o que
            exigimos: não-retenção e não-treinamento por escrito. O provedor será nomeado nesta
            página, com essas cláusulas, antes de a funcionalidade existir.
          </li>
          <li>
            <strong>A localização é removida antes do envio.</strong> Fotos carregam EXIF, que pode
            incluir as coordenadas de onde você estava. O aplicativo remove esses metadados no seu
            aparelho, antes de a imagem sair.
          </li>
          <li>
            <strong>Você não vai junto.</strong> O que sai é a imagem (ou o áudio) e a pergunta. Não
            vai seu e-mail, seu nome, nem qualquer identificador seu — do lado do provedor, uma
            chamada é indistinguível da seguinte.
          </li>
          <li>
            <strong>Seus dados não são usados para treinar modelo.</strong> É condição para
            contratar o provedor, e não uma expectativa: um fornecedor que não ofereça essa garantia
            por escrito não entra.
          </li>
          <li>
            <strong>Transferência internacional.</strong> Os servidores do gateway e do provedor de
            modelo ficam fora do Brasil. A LGPD permite (art. 33), e é por isso que este item está
            escrito aqui em vez de omitido.
          </li>
          <li>
            <strong>Trocar de fornecedor exige mudar o código.</strong> Duas listas ficam no
            repositório, e não numa configuração de servidor: o <em>endereço</em> para onde o
            conteúdo pode ser enviado e os <em>modelos</em> autorizados a recebê-lo. São duas porque
            uma não implica a outra — um endereço não revisado pode servir um modelo que está nesta
            política. Se alguém apontar o sistema para qualquer um dos dois fora do que está aqui, a
            chamada é <em>recusada</em> antes de qualquer byte sair, em vez de executada. É o
            mecanismo que impede este texto de ficar desatualizado sem ninguém perceber.
          </li>
        </ul>

        <p>
          <strong>Se você auto-hospeda o Fatia</strong> com um modelo rodando na sua própria
          máquina, nada disso se aplica: não há terceiro envolvido, porque o dado não sai de onde
          você o instalou.        </p>
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
          <li>
            <strong>Cloudflare AI Gateway e o provedor de modelo</strong> — somente se e quando você
            ativar a IA hospedada, que ainda não está disponível. Recebem a imagem, o áudio ou o
            texto da pergunta, sem nenhum identificador seu. O gateway recebe, em cada chamada, a
            instrução de <strong>não registrar</strong> o conteúdo; do lado do provedor de modelo,
            quem responde pela retenção é o contrato com ele, que será nomeado aqui — junto dessa
            cláusula — antes de a funcionalidade existir. Veja{' '}
            <strong>Inteligência artificial</strong>.          </li>
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
