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
- Notificação de resposta e de post removido fica para a 8c.

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
