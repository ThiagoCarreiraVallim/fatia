# ADR 037 — O PRD descreve o produto atual, e só uma ADR muda o escopo negativo

**Status:** Accepted
**Data:** 2026-10-19
**Supera:** [ADR 013](./013-roadmap-supera-escopo-negativo-v1.md)

## Contexto

A ADR 013 resolveu a contradição entre o PRD da v1 e as épicas do roadmap com uma regra de
precedência: trabalho de v1 obedece ao §4 do PRD, trabalho de roadmap obedece à épica, e o PRD
registra cada exceção. Ela rejeitou reescrever o PRD para preservar o registro do que a v1 se propôs
a ser.

Dois meses depois, a regra não se sustenta:

1. **Não existe mais trabalho de v1.** Tudo o que se faz hoje é roadmap: plano FREE/PRO, comunidades,
   assentos, painel da equipe, desafios, mural, push. A metade "v1" da regra não se aplica a nada.
2. **O PRD continuou descrevendo outro produto.** Usuários "eu, namorada, amigos", "Se você quer
   instalar um app na loja, o Fatia ainda não é para você", não-objetivos que viraram funcionalidade
   (app nativo, exportação, instruções de exercício) e outros que o produto adotou sem passar pelo
   PRD (posts com imagem, IA vendida).
3. **"Issue aberta é exceção" ficou frouxa demais.** Com dezenas de issues novas (#275), qualquer item
   do escopo negativo pode ser contrariado por uma issue, sem que a decisão de produto fique
   registrada em lugar nenhum.

O histórico da v1 não se perde: está no git.

## Decisão

1. **O `docs/PRD.md` descreve o produto de hoje** — problema, públicos, princípios, o que existe,
   não-objetivos, métricas e riscos. A versão da v1 fica no histórico do git.
2. **Os não-objetivos do PRD (§5) valem para todo trabalho.** Não há mais distinção entre v1 e
   roadmap.
3. **Mudar um não-objetivo exige ADR**, não basta issue. Enquanto a ADR não existe, o item fica na
   lista "Em discussão" do PRD, apontando a issue com a label `discussion`.
4. **O PRD é atualizado junto com a ADR** que muda escopo, na mesma PR.

## Consequências

### Positivas

- Quem segue o `docs/CLAUDE.md` e lê o PRD primeiro passa a ler o produto que existe.
- Uma fonte de verdade sobre escopo, com decisão registrada em ADR em vez de inferida de issue.
- As sete issues `discussion` da #275 ganham um lugar claro no PRD e um caminho para entrar.

### Negativas

- Mudança de escopo fica mais cara: precisa de ADR. É o custo desejado.
- O PRD precisa ser mantido; desatualizado, volta o problema da ADR 013.

### Neutras

- O `docs/CLAUDE.md` continua mandando ler o PRD primeiro; muda a regra de dúvida sobre escopo.

## Alternativas consideradas

- **Manter a ADR 013 e só atualizar os blocos do §4.** Rejeitada: a metade "v1" da regra não se
  aplica a mais nada, e o resto do PRD (problema, usuários, fases) continuaria descrevendo outro
  produto.
- **Apagar o PRD e deixar as épicas descreverem o produto.** Rejeitada: issue registra trabalho, não
  o que o produto é nem o que ele se recusa a ser.
- **Guardar a v1 num arquivo à parte.** Rejeitada: o repositório acabou de remover o `_archive` por
  acumular documento que ninguém lê; o git já guarda a versão.
