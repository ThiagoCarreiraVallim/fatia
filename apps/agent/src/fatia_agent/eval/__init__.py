"""Benchmark de precisão do reconhecimento de refeição (#138).

**Este pacote mede; ele não afirma.** O que ele produz só vira número publicável
quando existir um conjunto de fotos de comida brasileira rotuladas **com peso de
balança** — que não existe e não se cria com código. Ver
`apps/agent/eval/README.md` e `docs/benchmark-reconhecimento-refeicao.md`.

O código mora dentro do pacote (e não em `apps/agent/eval/`, como o plano da
issue previa) por dois motivos concretos: assim `mypy --strict` e o `ruff` já o
cobrem sem configuração nova, e ele importa
`fatia_agent.recognition.recognize_meal` sem truque de `sys.path`. O que o plano
queria separado — **os dados** — continua separado: manifesto, imagens, ledger e
o guia de rotulagem ficam em `apps/agent/eval/`.
"""
