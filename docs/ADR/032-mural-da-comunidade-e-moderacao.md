# ADR 032 — Mural da comunidade com moderação pela equipe

**Status:** Accepted (Fase 8b, 18/10/2026)
**Data:** 2026-10-18

## Contexto

Até a Fase 8a, tudo o que um membro via na comunidade vinha da equipe: planos, dicas, exercícios,
desafios. O pedido do produto é uma **timeline**: membros e equipe publicam texto e foto,
comentam e reagem. É o primeiro conteúdo da comunidade escrito por **qualquer membro**, e isso
traz três riscos novos:

- conteúdo impróprio (spam, ofensa, assédio, conselho de saúde perigoso) visto por todos;
- exposição: uma foto ou um texto que a pessoa depois quer tirar;
- prompt injection: o assistente lê o mural pelas tools MCP, e o texto é de terceiros.

## Decisão

1. **Autor é a associação, não a conta.** `GroupPost.membershipId` (cascata). O nome que aparece
   é o apelido da comunidade (`GroupMembership.displayName`, o mesmo da 8a), pedido no primeiro
   post; a equipe ganha o selo "Equipe". Apagar a conta apaga posts, comentários, reações,
   denúncias e as imagens dos posts. Sair da comunidade não apaga: o post fica com o apelido.
2. **Quem publica.** `Group.postPolicy`: todos os membros (padrão) ou só a equipe. Reagir,
   comentar e denunciar é de todo membro ativo. Ações `post.read` e `post.create` na matriz; a
   política é conferida no service e no pedido de URL de envio da imagem.
3. **Conteúdo.** Texto em markdown-lite (até 2000 caracteres, sem HTML, o mesmo leitor das
   dicas), até 4 imagens pelo fluxo da ADR 028 (`post_image`: reprocessadas, sem EXIF), e
   comentário em texto puro (até 500). Sem edição: apagar e publicar de novo. Limites por pessoa:
   10 posts e 60 comentários por hora.
4. **Moderação é da equipe que já modera** (`content.moderate`: dono e criador). Remove e
   restaura post, remove comentário, fixa até 3 posts e trata a fila de denúncias. O post
   removido **some para todos menos o autor**, que vê o aviso com o motivo; as imagens ficam só
   para ele até ele apagar (ADR 028 §4). Restaurar vale por 30 dias pela tela de removidos.
5. **Denúncia anônima para a equipe.** A fila agrupa as denúncias abertas por alvo, com os
   motivos e as observações, sem dizer quem denunciou. Resolver uma resolve todas do alvo.
   Denunciar duas vezes a mesma coisa não cria outra linha; a própria publicação não se denuncia.
6. **Banir é do dono** (`member.ban`, como remover membro). Encerra a associação como a remoção
   (revoga vínculos e o assento, na mesma transação) e marca `BANNED`: o código e o convite não
   reabrem a porta. Desbanir volta a `REMOVED`, e a pessoa pode entrar de novo.
7. **O assistente lê, não obedece.** `list_group_posts` devolve o texto como conteúdo de
   terceiro (a descrição da tool diz isso) e as imagens como contagem, sem URL.
   `create_group_post` e `comment_on_group_post` são confirmáveis, com cartão no chat.

## Consequências

### Positivas

- A comunidade ganha vida própria sem a equipe precisar produzir tudo.
- O mesmo modelo de isolamento do resto da comunidade: tudo pelo `groupId` da URL.

### Negativas

- Moderação é trabalho humano da equipe; não há filtro automático. A fila e o limite por hora são
  o freio na v1.
- Notificação de comentário e de post removido: entregue na 8c (ADR 033).

### Neutras

- A denúncia guarda quem denunciou (para não repetir e para o export dela), mas não mostra.

## Alternativas consideradas

- **Autor pela conta (`userId`):** obrigaria a resolver apelido e papel em outra consulta e
  deixaria o post vivo depois de a associação acabar por cascata.
- **Apagar o post removido:** o autor perderia o que escreveu sem saber por quê, e a moderação
  não teria como desfazer engano.
- **Moderação automática por IA:** custo de inferência no grupo gratuito (a promessa da #161) e
  falso positivo sem ninguém para revisar.
- **Mostrar quem denunciou:** expõe quem denuncia a retaliação.

## Emenda (#394, 2026-11-17): bloqueio global, ocultar, enquetes, comunicados e avisos

8. **Bloqueio é global e vale nos dois sentidos.** `UserBlock` (quem bloqueou, quem foi
   bloqueado, o apelido de então e a comunidade onde aconteceu). Bloquear parte de um post ou
   comentário da comunidade da URL (o id do corpo é amarrado a ela) e esconde, **em todas as
   comunidades**, os posts, os comentários, as reações (contagens incluídas) e os comunicados
   de um para o outro, e corta os avisos de comentário, reação e comunicado entre os dois. Quem
   foi bloqueado não é avisado. O que sai em nome da comunidade (`publishedAs = GROUP`) não some:
   é da comunidade, não da pessoa; mas comentar ou reagir nele não avisa o autor que tem
   bloqueio com quem agiu. Não se bloqueia o próprio post nem um post da comunidade. Desbloquear é por Você >
   Conta > Pessoas bloqueadas. O export de dados leva os bloqueios que a pessoa fez, não os que
   recebeu (dizer quem bloqueou exporia essa pessoa).
9. **Ocultar é só para mim.** `GroupPostHide`: o post some só para quem ocultou, sem avisar
   ninguém.
10. **Enquete é um post.** `GroupPoll` com 2 a 4 opções, prazo de 1 a 30 dias, um voto por
    associação (dá para mudar até o prazo). **Nenhum resultado com menos de 5 votos, para
    ninguém, inclusive a equipe:** abaixo disso a API não manda nem o total nem as % (o
    `MIN_CELL` da ADR 026). Com 5 ou mais, o membro vê as % depois de votar ou com a enquete
    encerrada; o painel vê desde o quinto voto. Quem votou em quê nunca sai da API.
11. **Comunicados.** `GroupAnnouncement` com a ação nova `announcement.publish` (dono e
    profissional): agora ou num horário em blocos de 15 minutos (até 365 dias à frente),
    repetindo todo dia, toda semana ou todo mês, fixado com prazo e com notificação
    (`ANNOUNCEMENTS`, que a pessoa desliga nas preferências). Um job por minuto reivindica cada
    disparo com escrita condicional em `nextRunAt` antes de publicar, para duas instâncias não
    publicarem duas vezes. Em nome de uma pessoa, o aviso não vai para quem tem bloqueio com ela.
    **Sem e-mail:** falta descadastro com link.
12. **Avisos fixados viram carrossel.** `pinOrder` (o novo entra na frente) e `pinnedUntil`
    (prazo de 1 a 90 dias, ou sem prazo); continua o teto de 3. O comunicado agendado com o
    carrossel cheio tira o último.
13. **Posts automáticos.** Plano publicado, dica nova, exercício novo e desafio criado viram post
    (`kind = AUTO`, sem duplicar), se o tipo estiver ligado em `Group.autoPosts`.
