# ADR 020 — Foto e áudio trafegam para o provedor de IA, sem persistência em ponto nenhum

**Status:** Accepted
**Data:** 2026-08-03

## Contexto

Sub-issue #136 da épica de Fundação de IA (#133).

A [ADR 004](./004-sem-armazenamento-fotos.md) decidiu que o Fatia **não armazena fotos de
refeição**, e o `docs/DATA_RETENTION.md` descreveu o mecanismo que sustentava isso:

> Quando o usuário fotografa um prato para o Claude analisar, a imagem é processada no lado do
> Claude; o Fatia recebe só o resultado textual. Não há bucket, não há upload, não há EXIF.

A frase estava certa **e vai deixar de estar**. Naquele desenho existe um caminho só, o do MCP: o
Claude do próprio usuário olha a imagem na assinatura dele e chama `log_meal` com os macros
prontos. O Fatia nunca vê a imagem.

A [ADR 015](./015-agente-python-langgraph-cliente-mcp.md) abriu um segundo caminho — a inferência
**hospedada pela Fatia**, no `apps/agent`, contra o Cloudflare AI Gateway. Quando a #139 (refeição
por foto) subir, a imagem vai sair do dispositivo, atravessar o `apps/api`, chegar ao agente e
seguir ao gateway. A #141 fará o mesmo com áudio.

A decisão de **não armazenar** continua íntegra. O que passa a existir é **trânsito**, e trânsito
tem que ser declarado: foto de prato em contexto de saúde é dado pessoal sensível (LGPD art. 5º II),
e tratá-lo fora do que foi declarado ao titular é o problema que a #136 existe para evitar.

Uma ADR aceita é imutável, então esta complementa a 004 em vez de editá-la.

## Decisão

**A imagem e o áudio trafegam para o provedor de IA hospedada, e não são persistidos em ponto
nenhum do caminho.**

Ponto a ponto, e cada item é uma obrigação verificável, não uma intenção:

1. **Não há bucket, não há disco, não há coluna.** Nem no `apps/api`, nem no `apps/agent`. Os bytes
   existem em memória durante a requisição e morrem com ela. A ADR 004 segue valendo na íntegra.
   O título desta ADR diz "em ponto nenhum do caminho" e essa é a **intenção**; o que o repositório
   sustenta sozinho é o que está nesta linha. Os itens 6 e 7 dizem o que se faz com o resto do
   caminho, em vez de estender a promessa a quem não se controla.
2. **O EXIF é removido no dispositivo**, antes de a imagem sair — entrega da #139. É o único ponto
   onde isso pode acontecer com efeito: uma vez enviada, a localização já vazou. Sem isso, a
   afirmação de `/privacy` de que o Fatia não coleta localização ficaria falsa por um metadado que
   ninguém vê olhando o backend.
3. **Nenhum identificador do usuário acompanha o conteúdo.** O que vai ao provedor é a imagem (ou o
   áudio) e o prompt. Não vai `userId`, e-mail, nome, nem o Bearer do usuário — o Bearer serve o
   `apps/api` e o `/mcp`, não o gateway.
4. **O que fica registrado é o uso, não o conteúdo** (issue #135): modelo, unidades, custo,
   latência, sucesso. Nenhum campo de texto livre que possa carregar o que a pessoa comeu.
5. **O destino e o modelo são duas listas fechadas no código**
   (`apps/agent/.../allowed_models.py`). Ver "Consequências".
6. **O log do gateway é desligado em cada chamada**, pelo header `cf-aig-collect-log: false`. O
   Cloudflare AI Gateway grava corpo de requisição e de resposta por padrão — logging é o produto
   dele. Sem isto, o item 1 seria verdadeiro dentro do repositório e falso no painel da Cloudflare,
   onde a foto do prato ficaria legível. O header vai em toda requisição, e não só quando o
   endpoint parece remoto: essa derivação é justamente o que um proxy local engana.
7. **A retenção do provedor de modelo é contratual, e é declarada como tal.** Não há como executá-la
   a partir daqui, então ela não é afirmada como fato: o que se afirma é a exigência (não-retenção e
   não-treinamento por escrito) e o nome do provedor, que entra na `/privacy` na PR da #139.

A decisão vale para a **instância pública oficial**. Instância auto-hospedada apontando o
`AI_BASE_URL` para um modelo local não tem subprocessador nenhum: o dado não sai da máquina, e não
há terceiro a declarar. A `/privacy` já separa os dois casos para o resto do produto; a seção de IA
entra dentro dessa moldura.

## Consequências

### Positivas

- A afirmação pública passa a descrever o tratamento real. Hoje ela descreve um desenho que a #139
  torna obsoleto — publicar a funcionalidade sem isto seria tratar dado sensível fora do declarado.
- **A troca de subprocessador deixa de ser silenciosa.** Este é o ganho que não se obtém escrevendo
  texto. O AI Gateway troca de modelo por configuração, sem deploy, e a ADR 015 vende isso como
  vantagem. Só que trocar o modelo troca quem recebe a foto, e as três afirmações da política — quem
  é o subprocessador, que há transferência internacional, que o dado não treina modelo — dependem
  disso. Com `ALLOWED_MODELS`, mudar `AI_MODEL_VISION` no painel para um modelo não revisado faz a
  capacidade **recusar a chamada antes de qualquer byte sair**, com erro nomeado. Autorizar passa a
  exigir um PR, que é onde a revisão do texto acontece.
- **A mesma defesa vale para `AI_BASE_URL`, e ela precisava de uma lista própria.** Vigiar só o nome
  do modelo deixava um buraco do mesmo tamanho: `AI_BASE_URL` mora no mesmo painel, e um gateway
  roteia para muitos fornecedores enquanto muitos gateways servem o mesmo nome de modelo — nenhuma
  das duas listas implica a outra. Com um modelo já revisado configurado, apontar a base para outro
  proxy compatível com o protocolo da OpenAI mandaria a foto para um terceiro não declarado, sem
  diff e sem sintoma. `ALLOWED_HOSTS` fecha isso, com `AI_ENDPOINT_NOT_ALLOWED` separado de
  `AI_MODEL_NOT_ALLOWED` porque a correção é outra variável e outra lista.
- O caminho de melhor margem continua sendo o default (ADR 018): o Claude do usuário analisando a
  foto na assinatura dele. Esta ADR descreve o **segundo** caminho, não o substituto do primeiro.

### Negativas

- **A promessa "trocar de modelo é editar `.env` e reiniciar" (ADR 015) deixa de valer em
  produção.** É atrito deliberado, e limitado a endpoint remoto: contra provedor local a promessa
  continua intacta, então o desenvolvimento não sente nada.
- Uma capacidade cujo modelo ainda não foi revisado fica indisponível, mesmo com o gateway no ar e
  funcionando. A falha é fechada de propósito — o oposto seria enviar dado de saúde para um
  fornecedor que ninguém examinou.
- Instância auto-hospedada apontada para um gateway próprio precisa editar `ALLOWED_MODELS` **e**
  `ALLOWED_HOSTS`. Aceito: quem opera instância própria responde pela política dela, e o arquivo é
  uma lista.
- **Um proxy reverso em `localhost` encaminhando para um gateway remoto escapa das duas listas.** A
  fronteira é a URL configurada, e olhando só para ela não há como distinguir isso de um LM Studio.
  Aceito e declarado: um fail-open só é defensável quando está escrito. `PRIVACY_LOCAL_HOSTS` é uma
  lista separada da homônima de `settings.py` justamente para que ninguém a afrouxe por engano ao
  resolver um problema de credencial.
- **`cf-aig-collect-log: false` não substitui a opção do painel do gateway.** Ele cobre as chamadas
  que saem deste código; qualquer chamada feita por fora continua sujeita ao default. O runbook de
  produção manda desligar os dois, e este item existe para que a diferença fique registrada em vez
  de ser presumida.

### Neutras

- Nenhuma tool MCP nova. A ADR 018 mantém a inferência hospedada fora do catálogo; o total de tools
  não muda.
- O `docs/DATA_RETENTION.md` ganha a seção "O que sai para provedor de IA" e perde a frase que esta
  ADR torna obsoleta.

## Alternativas consideradas

- **Editar a ADR 004.** Rejeitada: ADR aceita é imutável (`docs/ADR/README.md`). E a 004 continua
  correta — o que mudou não foi a decisão de não armazenar, foi a existência de um segundo caminho.
- **Armazenar a foto temporariamente para permitir reprocessamento.** Rejeitada: criaria
  exatamente o bucket de imagem de saúde que a ADR 004 evitou, em troca de reprocessar uma foto que
  o usuário pode tirar de novo em dois segundos.
- **Remover o EXIF no servidor, em vez de no dispositivo.** Mais fácil de garantir por teste, e por
  isso tentador. Rejeitada: a localização já teria saído do aparelho e trafegado pela rede. O ponto
  de remoção tem que ser anterior ao envio.
- **Declarar os subprocessadores só no texto, sem lista no código.** É o que a issue pedia à letra.
  Rejeitada porque o risco central é uma edição de painel, e nenhum texto se defende disso: a
  política ficaria falsa sem que ninguém percebesse. O mesmo raciocínio da ADR 018 — a armadilha
  vira erro de execução, não linha na fatura.
- **Lista de modelos permitidos vinda de variável de ambiente.** Rejeitada de imediato: seria
  configurável pelo mesmo painel que o guarda existe para vigiar.
- **Confiar só na opção "Logs" do painel do AI Gateway.** Rejeitada pelo mesmo motivo de sempre: é
  uma caixa marcada por alguém, invisível no repositório, e desmarcá-la não deixa rastro. O header
  por chamada some de um diff se for removido, e é isso que faz a frase da `/privacy` ser
  conferível. Fazer os dois é a recomendação; depender só do painel não é.
- **Prometer, na `/privacy`, que o gateway e o provedor de modelo não guardam nada.** Era o texto da
  primeira versão desta entrega, e é falso para o gateway com as opções default. Rejeitada: a
  política afirma o que o repositório sustenta (item 1), o que o gateway é instruído a fazer
  (item 6) e o que o contrato exige (item 7) — três afirmações verificáveis no lugar de uma
  agradável.
