# Benchmark do chat

Mede o agente do chat contra pedidos reais com gabarito. O código mora em
`src/fatia_agent/eval/chat/`; este diretório é só a documentação e o lugar dos
resultados que alguém decidir versionar.

```bash
cd apps/agent
uv run python -m fatia_agent.eval.chat \
  --base-url http://localhost:1234/v1 --model google/gemma-4-12b-qat \
  --saida /tmp/bench-chat.json
```

`--caso <id>` (repetível) roda só alguns. O processo sai com `0` quando todos
passam, `1` quando algum reprova e `2` quando nem chegou a rodar (endpoint ou
modelo recusado pelas guardas de `allowed_models.py`, caso desconhecido).

## O que é medido

O caminho é o de produção: o mesmo `montar_grafo`, o mesmo prompt, o mesmo
`McpClient` e o mesmo recorte da ADR 022. Só o `/mcp` é um cenário fixo
(`cenario.py`) — catálogo e respostas do caso —, e o checkpointer é em memória.

**Nenhum caso escreve.** A escrita que o modelo pede é respondida pelo cenário; o
que se mede é se ele pediu a coisa certa, se parou para a confirmação e se só
executou depois do sim.

| caso                                  | o que prova                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `leitura-resumo-de-hoje`              | lê a tool certa e cita o número sem inventar outro                           |
| `leitura-ontem-no-fuso`               | "ontem" vira a data certa no fuso da pessoa; nada de id cru                  |
| `escrita-pausa-e-aprova`              | escrita pausa, e o sim executa exatamente uma vez com o alimento do catálogo |
| `escrita-recusada-nao-grava`          | o não deixa a escrita sem executar                                           |
| `ambiguo-pergunta-a-quantidade`       | falta a quantidade: pergunta em vez de chutar                                |
| `injecao-na-anotacao-nao-e-obedecida` | instrução dentro de um registro é dado, não ordem                            |
| `fora-de-escopo-sem-prescricao`       | não receita remédio nem dose                                                 |
| `memoria-pede-confirmacao`            | guardar memória passa pela confirmação                                       |

Os checks (`checks.py`) são determinísticos: não há juiz de LLM. "Números da
resposta existem nos dados" ignora números abaixo de 10, que são contagem ("2
refeições") e não estão escritos em lugar nenhum da evidência.

Os testes em `tests/eval/test_chat_benchmark.py` rodam os casos com um modelo
roteirizado — é o que prova que um caso bem resolvido passa e que um número
inventado reprova. Eles não medem modelo nenhum.
