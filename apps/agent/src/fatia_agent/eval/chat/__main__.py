"""Roda o benchmark do chat contra um provedor de verdade.

    uv run python -m fatia_agent.eval.chat \\
      --base-url http://localhost:1234/v1 --model google/gemma-4-12b-qat \\
      --saida /tmp/bench-chat.json

As guardas de host e de modelo revisados (`allowed_models.py`) valem aqui como em
produção: um endpoint remoto não revisado é recusado antes da primeira chamada.
"""

import argparse
import asyncio
import json
from pathlib import Path

from ...providers import AIProviderError, build_provider
from ...settings import AgentSettings
from .casos import selecionar
from .runner import resumo_em_markdown, rodar_caso


def _argumentos(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m fatia_agent.eval.chat",
        description="Mede o chat do agente contra casos com gabarito.",
    )
    parser.add_argument("--base-url", required=True, help="Endpoint OpenAI-compatível.")
    parser.add_argument("--model", required=True, help="Modelo de texto (com tools) a medir.")
    parser.add_argument(
        "--caso", action="append", dest="casos", help="Só este caso (repita para mais de um)."
    )
    parser.add_argument("--saida", type=Path, help="Grava o resultado completo em JSON.")
    return parser.parse_args(argv)


async def _rodar(args: argparse.Namespace) -> int:
    casos = selecionar(args.casos)
    provider = build_provider(AgentSettings(ai_base_url=args.base_url, ai_model_text=args.model))
    try:
        resultados = [await rodar_caso(caso, provider) for caso in casos]
    finally:
        await provider.aclose()

    print(resumo_em_markdown(resultados, modelo=args.model))
    if args.saida:
        args.saida.write_text(
            json.dumps(
                {"model": args.model, "cases": [r.como_dict() for r in resultados]},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    return 0 if all(r.ok for r in resultados) else 1


def main(argv: list[str] | None = None) -> int:
    args = _argumentos(argv)
    try:
        return asyncio.run(_rodar(args))
    except (AIProviderError, ValueError) as erro:
        print(f"erro: {erro}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
