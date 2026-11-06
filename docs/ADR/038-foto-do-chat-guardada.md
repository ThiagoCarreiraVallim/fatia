# ADR 038 — A foto do chat é guardada, enquanto a conversa existir

**Status:** Accepted
**Data:** 2026-11-05

## Contexto

A [ADR 020](./020-foto-e-audio-trafegam-sem-persistencia.md) decidiu que foto e áudio **trafegam**
para o provedor de IA e **não são persistidos** em ponto nenhum que o Fatia opera: "não há bucket,
não há disco, não há coluna". O chat herdou a regra: a foto ia em base64 dentro do turno, chegava ao
modelo, e depois de um F5 a conversa mostrava só o aviso "📷 Foto enviada — ela não fica guardada".

Na prática, isso deixa a conversa sem o que ela discutiu. "Esse prato tinha quantas calorias?"
volta, depois de recarregar, como uma pergunta sobre nada. E perguntar de novo sobre a mesma foto
exige fotografar de novo.

Desde a [ADR 028](./028-imagens-de-posts-da-comunidade.md), o Fatia **já tem** um bucket (R2 em
produção, SeaweedFS no dev), com envio direto por URL assinada, reprocessamento que tira metadado e
faxina de órfãos. O que faltava era decidir que a foto do chat pode morar nele.

Uma ADR aceita é imutável; esta substitui a 020 **só para a foto do chat**.

## Decisão

**A foto que a pessoa manda no chat é guardada no bucket, ligada à mensagem, enquanto a conversa
existir.**

1. **O envio é direto ao bucket**, por URL assinada (`POST /media/chat-photos`), como a mídia da
   comunidade. A chave nasce sob o prefixo da pessoa (`users/{userId}/chat/…`).
2. **O `confirm` reprocessa no servidor**: gira pela orientação, reduz a 1280 px, reexporta em JPEG
   sem metadado nenhum. O aparelho já recodifica antes de enviar (ADR 020, item 2); a segunda
   passada é para o cliente que não fizer isso.
3. **A foto pertence à mensagem**, e a mensagem à conversa. O turno manda `photoIds`; a API confere
   que cada id é desta pessoa, de foto do chat, pronta e ainda não usada, e só então lê os bytes.
   Id de outra pessoa responde 404, como qualquer recurso alheio (ADR 010, #92).
4. **O agente continua recebendo base64.** A API lê o objeto e repassa como antes: o agente não
   ganha um destino de rede novo, e a lista de hosts da ADR 020 não muda.
5. **Apagar a conversa apaga as fotos dela** — objeto e linha, antes de as mensagens caírem.
   **Apagar a conta apaga todas** (`MediaService.beforeDeleteAccount`). Foto enviada e nunca usada
   num turno vira lixo em 24 h, pela faxina que já existe.
6. **A leitura é sempre por URL assinada que vence** (10 min), emitida só dentro da resposta de
   `GET /chat/conversations/:id`, que já amarrou a conversa à pessoa. Não há link público.
7. **Instância sem bucket continua no caminho antigo.** Sem as variáveis `MEDIA_S3_*`, o pedido de
   envio responde 503 e o cliente manda a foto em base64, que não fica guardada (ADR 020).

O **reconhecimento de refeição por foto** (#139) não muda: ele continua sem gravar nada. Esta
decisão é só do chat.

## Consequências

### Positivas

- A conversa reaberta mostra a foto de que ela fala.
- O caminho de envio é o mesmo da comunidade, com os mesmos testes da URL assinada (tipo e tamanho
  amarrados na assinatura, sem o checksum de corpo vazio do SDK).

### Negativas

- **Passa a existir imagem de saúde guardada.** É o que a ADR 004 evitou para o fluxo de registro
  de refeição. O que limita o dano é a retenção atada à conversa e a exclusão pela própria pessoa,
  sem cópia em outro lugar.
- O R2 (Cloudflare) passa a guardar dado pessoal sensível, e entra na `/privacy` como operador de
  armazenamento.
- Os bytes passam pelo NestJS duas vezes: no `confirm` e a cada turno que leva a foto. Aceito pela
  simplicidade de não abrir um destino de rede no agente.

### Neutras

- `MediaFile` ganha `chatMessageId` e `chatPosition`, com `onDelete: SetNull`: a linha sobrevive ao
  `delete` da mensagem até o objeto sair do bucket, e a faxina é a rede de segurança.
- O caminho em base64 fica aceito na API para o app instalado que ainda não sobe ao bucket.

## Alternativas consideradas

- **O agente buscar a foto no bucket por URL assinada** (o desenho do backup de agosto, b09bd65).
  Tira os bytes do NestJS, mas abre um destino de rede no agente vindo do corpo da requisição —
  forma de SSRF que exige lista própria de hosts. Rejeitada por agora: o ganho é de memória num
  turno de até três fotos.
- **Uma tabela `Attachment` própria.** Rejeitada: duplicaria envio, confirmação, faxina e exclusão
  da conta, que o `MediaFile` já resolve.
- **Prazo fixo de retenção (ex.: 90 dias).** Rejeitada pela pessoa que decide o produto: a foto
  sumir de uma conversa aberta seria tão confuso quanto ela nunca ter sido guardada.
