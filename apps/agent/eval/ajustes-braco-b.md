# Ajustes do braço B

O registro de cada ajuste feito nas 18 tools de intenção durante a fase de ajuste, no split `dev`,
antes do congelamento do braço B. As regras estão em
[`docs/eval-fronteira-de-tools.md`](../../../docs/eval-fronteira-de-tools.md) §"O split, e quem se
ajusta nele".

- **O que pode mudar:** descrição, nome de campo, enum e default das 18 tools de intenção. O braço
  A, as tarefas, os gabaritos e o prompt do chat não mudam, e o `execute` não ganha lógica.
- **Um ajuste por medição**, para o efeito ser atribuível: só as tarefas do `dev` afetadas, 5
  repetições, os dois modelos, antes e depois.
- **Veredito:** útil (melhorou sem piorar outra tarefa), inútil ou prejudicial. Inútil e
  prejudicial são revertidos, e a linha fica com o motivo. Ajuste que só ajuda um modelo é
  suspeito, e a linha diz isso.
- No máximo dois ciclos de ajuste e rodada.

Os inúteis ficam aqui tanto quanto os úteis: eles mostram que mexer na descrição nem sempre
resolve.

| #   | Tool | Antes → depois | Tarefa e modelo que motivaram (erro observado) | Efeito medido (acertos antes → depois, por modelo) | Veredito |
| --- | ---- | -------------- | ---------------------------------------------- | -------------------------------------------------- | -------- |
