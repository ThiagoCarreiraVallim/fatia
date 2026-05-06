# ADR 004 — Sem armazenamento de fotos de refeição

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

O fluxo principal de logging de comida é: usuário tira foto no app do Claude, Claude analisa, extrai macros e items, chama `log_meal` com dados estruturados.

A pergunta é: deveríamos guardar a foto também? Casos de uso possíveis:
- Revisar visualmente o que foi comido em um dia passado
- Refinar estimativas no futuro com modelo melhor
- Compartilhar com nutricionista

## Decisão

A v1 NÃO armazena fotos. Apenas os dados estruturados extraídos pelo Claude são persistidos.

## Consequências

### Positivas
- Zero infraestrutura de storage (sem S3, MinIO, sem volume dedicado)
- Schema mais simples (`Meal` sem campo `photoUrl`)
- LGPD/privacidade — não há foto de comida (que pode revelar contexto privado) parada em servidor
- Custo zero de storage e bandwidth
- Backup mais leve (apenas Postgres)

### Negativas
- Não dá para revisar visualmente o histórico
- Se a estimativa do Claude estiver errada e o usuário só perceber depois, não tem como reanalisar
- Perde dado potencialmente útil para fine-tuning futuro

### Neutras
- O Claude pode logar a descrição textual em `Meal.notes` se quiser registrar contexto

## Reversibilidade

**Trivial.** Adicionar `photoUrl String?` em `Meal` é uma migration simples. Pode-se introduzir depois sem refator. Por isso, decidir "não" agora é seguro.

## Alternativas consideradas

- **Armazenar tudo em S3/MinIO:** rejeitado por adicionar infra desnecessária para um app de 10 usuários. Reavaliar se virar produto público.
- **Armazenar só último N por usuário:** rejeitado por complexidade — política de retenção, jobs de limpeza. YAGNI.
- **Deixar Claude guardar como anexo no chat:** já acontece naturalmente. O usuário pode rolar o chat se quiser revisar.
