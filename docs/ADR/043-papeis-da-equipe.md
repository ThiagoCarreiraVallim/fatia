# ADR 043 — Papéis da equipe e consentimento por papel

**Status:** Accepted
**Data:** 2026-11-14
**Altera:** [ADR 026](./026-consentimento-ao-entrar-na-comunidade.md), item "o consentimento vale para a equipe toda de uma vez"

## Contexto

Hoje a comunidade tem quatro papéis (`GroupRole`: `OWNER`, `PROFESSIONAL`, `CREATOR`, `MEMBER`), e
o [`PERMISSIONS.md`](../PERMISSIONS.md) separa duas perguntas: **o que o papel administra** (matriz
de ações) e **o que se lê de um aluno** (vínculo consentido por categoria, nunca o papel). Pela ADR
026, o aluno consente ao entrar, uma vez, para a equipe toda.

O redesign pede mais (#404, #372; Mapa 3.9 "Consentimento por papel" e 4.34 "Papel
nutricionista"; sobras #313 e #312 registradas na #418):

- **administrador** (gere a comunidade sem ser o dono) e **recepção** (atende no balcão);
- **nutricionista**, que acompanha a alimentação e não tem por que ver a carga do agachamento;
- o aluno escolher **o que cada papel vê**, e não um pacote só para todo mundo da equipe.

## Decisão

### Papéis

| Papel          | Administra                                                                                       | Pode receber vínculo de leitura                         |
| -------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Dono (`OWNER`) | tudo, inclusive assentos, faturas, ofertas e passar a posse                                      | sim, as categorias que o aluno liberar para o dono      |
| Administrador  | membros, convites, conteúdo, moderação, desafios, agenda; **não** vê faturas nem passa a posse   | **não** — administrar não é acompanhar                  |
| Profissional   | conteúdo, planos enviados, avaliações, desafios; com **especialidade** (treino, nutrição, outra) | sim, as categorias que o aluno liberar para ele         |
| Nutricionista  | é o profissional com especialidade nutrição                                                      | só `NUTRITION`, `GOALS`, `BODY` e "Fotos das refeições" |
| Criador        | conteúdo e desafios                                                                              | sim, como hoje (ADR 026)                                |
| Recepção       | check-in, nome e status de quem chega                                                            | **não**, nunca                                          |
| Membro         | nada da comunidade                                                                               | **não**, nunca                                          |

1. **Nutricionista é especialidade do profissional, não papel novo no enum.** A especialidade
   **restringe** as categorias que o vínculo pode ter: um vínculo de nutricionista nunca carrega
   `WORKOUT` nem `HABITS`, mesmo que o aluno marque. "Fotos das refeições"
   ([ADR 038](./038-foto-da-refeicao-guardada.md)) só entra se o aluno liberar essa categoria.
2. **Administrador e recepção são papéis novos** (`ADMIN`, `RECEPTION`; migração na #404) e **nunca
   recebem vínculo**: a leitura de dado de aluno continua sendo só pelo vínculo, e esses dois papéis
   ficam na coluna "Quem NUNCA recebe", como `MEMBER`.
3. **Papel nunca dá leitura.** Promover alguém, dar especialidade ou atribuir responsável
   ("acompanha") não abre dado novo; o que abre é o vínculo que o aluno consentiu.

### Consentimento por papel

4. **No convite e ao entrar, o aluno escolhe por papel**: o que profissionais de treino, a
   nutricionista e o dono (ou o criador) veem. O padrão de cada grupo é o que a comunidade exige
   (`Group.requiredSharingScopes`) recortado pelo que o papel pode receber; o aluno pode liberar mais
   ou recusar o que não é exigido. O texto do convite diz o que cada papel verá.
5. **A ADR 026 muda só nisso**: o consentimento continua dado ao entrar e vira vínculos para quem
   está na equipe, mas o vínculo de cada pessoa da equipe leva as categorias **do papel dela**, não
   as da equipe toda. Quem entra na equipe depois recebe as categorias do seu papel; quem muda de
   papel tem os vínculos recalculados (pode perder categoria, nunca ganhar sem aceite).
6. **"Profissionais veem só quem acompanham"** (opção da comunidade, #404) estreita ainda mais: com
   ela ligada, o profissional só lê quem ele acompanha, mesmo com vínculo.
7. **Toda leitura vai para `ProfessionalAccessLog`, inclusive as negadas** (`denied`), com a
   categoria; o aluno vê o registro (`list_data_access_log`), agora com o papel de quem leu.
8. **O `PERMISSIONS.md` muda junto com o código.** As tabelas lidas pelo `permission-matrix.spec.ts`
   só ganham papel ou categoria no PR que muda `permissions.ts` e o enum; até lá, o plano fica numa
   seção "Planejado" fora das tabelas.

### O que continua igual

- O MCP continua sem administração da comunidade (PRD §3.5, #343).
- `MEMBER` nunca lê ninguém; papel decide **ação**, vínculo decide **leitura**.

## Consequências

### Positivas

- O aluno controla quem vê o quê com o recorte que faz sentido: a nutricionista vê a dieta, o
  personal vê o treino, e a recepção não vê nada.
- A comunidade pode delegar a gestão a um administrador sem lhe entregar dado de saúde.

### Negativas

- Migração: `GroupRole` ganha `ADMIN` e `RECEPTION`; `GroupMembership` ganha especialidade e
  responsável; o cálculo dos vínculos passa a olhar o papel (#404).
- A tela de consentimento fica maior (um bloco por papel); o canvas tem o padrão em `Onb-03` e
  no convite, e a #372 desenha o resto com o mesmo componente.
- Vínculos já criados pela ADR 026 continuam valendo como estão; o recorte por papel vale a partir
  do próximo aceite ou da próxima mudança de papel.

### Neutras

- A matriz de ações ganha duas colunas, conferidas pelo `permission-matrix.spec.ts` como hoje.

## Alternativas consideradas

- **`NUTRITIONIST` como valor de `GroupRole`.** Rejeitada: duplicaria toda a matriz de ações do
  profissional para mudar só a leitura, que já é decidida pelo vínculo (recomendação da #404).
- **Consentimento único para a equipe toda (ADR 026 como está).** Rejeitada: obriga o aluno a
  mostrar o treino à nutricionista para mostrar a dieta.
- **Recepção vendo o resumo do aluno.** Rejeitada: o balcão não acompanha ninguém; nome, status e
  check-in bastam (#390, #398).
