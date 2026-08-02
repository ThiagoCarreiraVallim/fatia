"""Agente de IA da Fatia.

Serviço Python separado (ADR 015). Não tem credencial de banco e não tem rota
privilegiada: o acesso a dado do usuário é sempre pelo `/mcp` do NestJS, com o
Bearer do próprio usuário. Aqui vive só a inferência.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
