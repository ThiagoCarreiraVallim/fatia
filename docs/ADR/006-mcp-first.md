# ADR 006 — MCP como interface primária e completa

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

O fluxo de uso real desse app é: usuário abre Claude no celular durante o dia (na hora que comeu, depois do treino) e fala/manda foto. Abrir um app dedicado no celular é fricção desnecessária quando o Claude já está aberto e é a interface mais natural pra IA conversacional.

O PWA existe pra revisar dados visualmente, corrigir algo, e logar treino na hora (durante a série, abrir Claude é desconfortável). Mas no agregado, a maior parte do logging vai pelo Claude.

A pergunta arquitetural: o MCP deveria expor só o "essencial", e features avançadas (criar plano, gerenciar exercícios custom, etc) ficarem só no PWA? Ou deveria expor tudo?

## Decisão

**MCP é a interface primária e completa do FitTrack.** Toda funcionalidade do sistema é expressável via tool MCP, com poucas exceções deliberadas (gestão de credenciais sensíveis: criar usuário, emitir token MCP, mudar senha).

O PWA é a interface secundária — uma camada de visualização que **espelha** o que o MCP oferece, com vantagem de UX visual (gráficos, listas, edição inline).

### Implicações concretas

1. **Total de ~50 tools MCP**, cobrindo CRUD completo de todas as entidades user-owned: refeições, itens de refeição, planos de treino, exercícios do plano, sessões, séries, peso, alimentos custom, exercícios custom, metas e perfil.

2. **Services compartilhados.** Lógica de negócio mora em services do NestJS. Tanto o controller REST quanto o handler MCP delegam para o mesmo método. Duplicação de lógica entre as duas camadas é bug, não feature.

3. **PWA pode ser parcial.** Se na v1 o CRUD de planos de treino só estiver no MCP, o usuário ainda consegue criar planos via Claude. O PWA cobre o que for prioritário visualmente; o resto fica no Claude.

4. **Documentação MCP é first-class.** `docs/MCP.md` é tão importante quanto `docs/PRD.md`. Quando uma feature nova é planejada, a tool MCP é desenhada antes ou junto da tela.

## Consequências

### Positivas
- Usuário tem flexibilidade total: pode rodar tudo pelo Claude, não precisa abrir o PWA pra tarefas pontuais
- Reduz pressão sobre prioridade do PWA — features visuais podem entrar gradualmente
- Forçamos arquitetura limpa: services são a única fonte de verdade da lógica
- Casos avançados (massa de dados, scripts) ficam triviais — Claude vira automação

### Negativas
- Mais superfície de API para manter (~50 tools vs. ~20 no design original)
- Cada tool nova é um contrato público — mudanças breaking afetam usuários do Claude
- Necessidade de documentação MCP rigorosa, atualizada com cada feature
- Rate limits e auditoria precisam ser robustos desde a v1

### Neutras
- Volume extra de testes (cada service crítico testado uma vez serve as duas camadas)
- Dois schemas Zod por feature: um para input MCP, outro DTO REST. Aceitável.

## Alternativas consideradas

- **MCP só com operações comuns (log_meal, log_set, get_summary):** rejeitado. Cria experiência incompleta — usuário pediria via Claude e Claude responderia "não posso fazer isso, abre o app". Atrito que destrói a proposta.

- **MCP somente leitura, todas as escritas pelo PWA:** rejeitado pelo mesmo motivo — perderia o caso central de logar comida via foto.

- **Dois servidores MCP, um básico e um avançado:** rejeitado por complexidade sem ganho. Tools são baratas; o limite é design, não infraestrutura.

## Não-decisão (deliberada)

**O que NÃO está no MCP** está documentado em `docs/MCP.md` na seção "Tools intencionalmente NÃO expostas". Atualizar essa lista é tão importante quanto adicionar tools novas. Resumo:
- Criação de usuários (admin via PWA)
- Emissão de tokens MCP (PWA mostra uma vez)
- Troca de senha
- Acesso a dados de outros usuários (mesmo admin)

## Reversibilidade

Reduzir escopo é trivial: tools podem ser removidas com aviso de deprecation. Aumentar escopo (caso da própria decisão) também é trivial: adicionar tool nova não quebra nada. A decisão é segura.
