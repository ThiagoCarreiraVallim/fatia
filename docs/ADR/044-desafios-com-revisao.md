# ADR 044 — Desafios com pontos e check-in por foto, revisado só pela equipe

**Status:** Accepted
**Data:** 2026-11-14
**Altera:** [ADR 027](./027-desafios-por-aderencia-a-propria-meta.md) e PRD §3.4/§5, só no ponto "foto"

## Contexto

A ADR 027 e o PRD (§3.4 "Ninguém compara corpo" e o não-objetivo "Comparar corpo… com peso,
medida ou foto") fecham os desafios em constância e aderência à própria meta, e a prancha
`Dados-Comunidade` resume isso como "nunca peso ou foto".

O redesign (#395; pranchas `Cm-17*`, `Cm-18`, `Pn-13`) traz tipos novos de desafio — foto, água,
passos, nutrição por dia na meta e **pontos** com tabela e máximo por dia — e um **check-in com
foto** ligado ao treino registrado, com uma fila "Para revisar" em que a equipe dá "Vale" ou
"Anular". A foto existe para coibir o check-in falso, não para mostrar ninguém.

O canvas vai além: mostra as fotos aos outros participantes, borradas a visitantes, e oferece
"Também postar no mural". O dono do produto decidiu: **foto só como prova revisada pela equipe,
nunca no ranking.**

## Decisão

1. **A foto de check-in é prova, não conteúdo.** Quem vê: a própria pessoa e a equipe que revisa
   (papéis com `challenge.manage`). **Ninguém mais**: nem os outros participantes, nem visitantes
   (nem borrada), nem o ranking, nem o mural, nem os agregados do painel.
2. **O check-in não publica nada.** Não há "Também postar no mural" a partir do check-in. Se a
   pessoa quiser mostrar o treino, faz um post comum, por ação dela, com as regras do mural
   ([ADR 032](./032-mural-da-comunidade-e-moderacao.md), imagem pela
   [ADR 028](./028-imagens-de-posts-da-comunidade.md)).
3. **Foto de corpo é proibida.** A tela de captura diz o que fotografar (o treino, o lugar, o
   aparelho); a equipe anula o check-in que mostrar corpo, com o motivo, e a foto anulada é apagada
   na decisão. Não há moderação automática no primeiro ciclo.
4. **Captura.** Só a câmera do app (sem galeria), até 2 h depois de um treino registrado com 20 min
   ou mais, um por dia; carimbo de data e hora do servidor; EXIF e localização removidos no aparelho
   e no servidor; bucket privado e URL assinada de curta duração (ADR 028). Editar o treino depois
   devolve o check-in à revisão. As regras são conferidas no servidor (#395).
5. **Revisão.** O ponto do check-in fica pendente até "Vale" ou "Anular"; anular leva o motivo à
   pessoa. Membros podem sinalizar "Não parece válido" sem ver a foto (a sinalização vale pelo
   check-in, não pela imagem).
6. **O ranking continua só de constância e aderência.** Pontos vêm de dias, check-ins válidos e da
   tabela de pontos; nunca de peso, medida, kcal, gramas, ml ou passos de outra pessoa. Água,
   passos e nutrição pontuam por **dia na meta** (ADR 027). Peso e medida continuam proibidos como
   métrica.
7. **Retenção.** A foto vive até **30 dias depois do encerramento** do desafio (`finalizedAt`), prazo
   para contestar a revisão, e então é apagada; sair da comunidade, sair do desafio ou apagar a conta
   apaga na hora. Entra no export LGPD enquanto existir. Registrado no
   [`DATA_RETENTION.md`](../DATA_RETENTION.md).
8. **Consentimento.** Entrar num desafio do tipo foto é o aceite: a tela de entrada diz que a foto
   é vista só pela equipe que revisa e quando é apagada. Não abre nenhuma categoria de
   compartilhamento (a foto não é "Fotos das refeições", ADR 038, nem leitura do `ProfessionalLink`).
9. **`MIN_CELL`.** O placar é opt-in e mostra só apelido, pontos e posição a quem participa: o
   limiar de 5 não se aplica a ele. Vale para todo **agregado** do desafio no painel (taxa de
   participação, check-ins por dia), como na [`AGGREGATION_POLICY.md`](../AGGREGATION_POLICY.md).
10. **MCP.** Sem tool de check-in com foto (exige a câmera do app) e sem tool de revisão
    (administração). As tools de leitura nunca devolvem foto nem valor bruto de outra pessoa.

## Consequências

### Positivas

- O check-in falso fica caro sem expor ninguém: a foto só serve para a equipe decidir.
- O princípio "ninguém compara corpo" continua de pé; a mudança é estreita e escrita.

### Negativas

- Dado novo sensível no servidor (foto com contexto de treino): `THREAT_MODEL.md` §16,
  `DATA_RETENTION.md`, export, exclusão e `user-isolation.spec.ts` na #395.
- Carga de revisão para a equipe; sem automação, desafio grande gera fila grande.
- As caixas da #395 que mostram foto a participantes e visitantes e o "Também postar no mural" saem
  do escopo.

### Neutras

- A foto de check-in usa o mesmo `MediaFile` e o mesmo bucket da comunidade.

## Alternativas consideradas

- **Fotos visíveis aos participantes (canvas).** Rejeitada pelo dono do produto: vira comparação
  de corpo e de rotina por outro caminho.
- **Fotos borradas para visitante.** Rejeitada: borrar no cliente vaza o original; no servidor é
  custo para mostrar algo que não precisa ser mostrado.
- **Sem foto (ADR 027 como está).** Rejeitada: sem prova, o desafio de presença vira honra, e a
  equipe pediu a revisão.
- **Guardar a foto enquanto o desafio existir.** Rejeitada: a prova só importa até a revisão
  fechar; 30 dias depois do fim cobrem a contestação.

## Nota — implementação (#395, 2026-11-18)

A [ADR 047](./047-checkin-com-foto-aceite-e-fila.md) registra como a #395 implementou esta decisão:
o aceite próprio (`photoConsentAt`/`photoConsentVersion`, em vez de "entrar é o aceite" do item 8),
a permissão `challenge.review` (mesmos papéis de `challenge.manage`, item 1), o limite de
sinalizações, o teto da fila, os sinais do servidor e a regra de que um borrão, se um dia existir,
nasce no servidor. Nenhuma foto é servida a quem não é a pessoa nem a equipe.
