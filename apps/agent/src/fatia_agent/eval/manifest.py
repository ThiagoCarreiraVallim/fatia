"""O manifesto de rótulos: o que está na foto, em gramas de balança (#138).

**Os rótulos são versionados; as fotos não.** Foto de refeição de gente real
mostra o que a pessoa come, e em contexto de saúde isso é dado sensível — a
mesma categoria que `docs/DATA_RETENTION.md` promete não guardar. Um diretório de
pratos num repositório público não tem desfazer. Então o `manifest.jsonl` carrega
o rótulo e o `sha256`, e as imagens vivem fora do git (`apps/agent/eval/images/`,
no `.gitignore`).

O `sha256` não é burocracia: é o que amarra o número publicado **a estas fotos**.
Sem ele, um relatório que diz "MAPE 22 %" e um diretório de imagens que alguém
mexeu depois são indistinguíveis de um resultado válido.
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

Split = Literal["dev", "eval"]

# Extensão → `media_type`, na ordem em que o arquivo é procurado. HEIC fica de
# fora pelo mesmo motivo de `recognition/recognize_meal.py`: os endpoints
# OpenAI-compatíveis não o aceitam.
EXTENSOES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class ErroDeManifesto(Exception):
    """Manifesto malformado, foto ausente ou `sha256` que não confere.

    É sempre fatal: um benchmark que segue em frente com metade do conjunto
    produz um número sobre um conjunto que ninguém declarou.
    """


class ItemRotulado(BaseModel):
    """Um alimento do prato, como a **balança** o mediu."""

    model_config = {"extra": "forbid"}

    food: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=5_000)

    # Opcional, e é o que torna a métrica em kcal possível: kcal por 100 g da
    # entrada da TACO que quem rotulou escolheu para este alimento.
    #
    # Vem do rótulo, e não do modelo, porque é assim que o **produto** calcula:
    # quando o item casa com a tabela, o macro sai de `calcMacrosFromFood` com a
    # grama que o modelo estimou, e a estimativa de kcal do modelo é descartada
    # (`meal-recognition.service.ts`). Medir a kcal auto-relatada pelo modelo
    # mediria um número que o produto joga fora.
    kcal_100g: float | None = Field(default=None, ge=0, le=1_000)


class RotuloDeFoto(BaseModel):
    """Uma linha do `manifest.jsonl`."""

    model_config = {"extra": "forbid"}

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9._-]*$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    split: Split

    # Lista vazia é rótulo legítimo, não erro: uma foto sem comida (prato lavado,
    # mesa vazia) é o controle que mede se o modelo inventa comida onde não tem.
    items: list[ItemRotulado] = Field(default_factory=list)

    # Condição da foto, para o relatório poder dizer sobre o que ele mede:
    # "restaurante, luz amarela, de cima". Nunca vira instrução.
    condicao: str | None = Field(default=None, max_length=200)

    @field_validator("items")
    @classmethod
    def _sem_alimento_repetido(cls, itens: list[ItemRotulado]) -> list[ItemRotulado]:
        # Dois "arroz branco" no mesmo rótulo tornam o casamento um-para-um
        # ambíguo e o erro de porção indefinido — some as gramas em uma linha só.
        nomes = [item.food.strip().lower() for item in itens]
        repetidos = {nome for nome in nomes if nomes.count(nome) > 1}
        if repetidos:
            raise ValueError(f"alimento repetido no mesmo rótulo: {sorted(repetidos)}")
        return itens


@dataclass(frozen=True)
class FotoDoConjunto:
    """Um rótulo já casado com os bytes da imagem no disco."""

    rotulo: RotuloDeFoto
    caminho: Path
    media_type: str


def carregar_manifesto(caminho: Path) -> list[RotuloDeFoto]:
    """Lê o `manifest.jsonl`, ou levanta `ErroDeManifesto` dizendo a linha.

    Linha em branco é ignorada; qualquer outra coisa é erro. O número da linha
    vai na mensagem porque um manifesto de 50 fotos escrito à mão erra, e "campo
    inválido" sem posição faz procurar em cinquenta lugares.
    """
    if not caminho.is_file():
        raise ErroDeManifesto(f"Manifesto não encontrado: {caminho}")

    rotulos: list[RotuloDeFoto] = []
    vistos: set[str] = set()

    for numero, linha in enumerate(caminho.read_text(encoding="utf-8").splitlines(), start=1):
        if not linha.strip():
            continue
        try:
            bruto: object = json.loads(linha)
        except ValueError as exc:
            raise ErroDeManifesto(f"{caminho}:{numero} não é JSON: {exc}") from exc
        if not isinstance(bruto, dict):
            raise ErroDeManifesto(f"{caminho}:{numero} não é um objeto JSON.")
        try:
            rotulo = RotuloDeFoto.model_validate(bruto)
        except ValidationError as exc:
            raise ErroDeManifesto(f"{caminho}:{numero} inválido — {exc.errors()[0]}") from exc
        if rotulo.id in vistos:
            raise ErroDeManifesto(f"{caminho}:{numero} repete o id '{rotulo.id}'.")
        vistos.add(rotulo.id)
        rotulos.append(rotulo)

    if not rotulos:
        raise ErroDeManifesto(f"{caminho} não tem nenhuma linha de rótulo.")
    return rotulos


def resolver_fotos(rotulos: list[RotuloDeFoto], imagens: Path) -> list[FotoDoConjunto]:
    """Casa cada rótulo com o arquivo `<id>.<ext>` e **confere o `sha256`**.

    Confere antes de rodar, e não durante, porque um conjunto que muda no meio da
    execução produz um relatório que se refere a um conjunto que não existe. As
    faltas saem todas de uma vez: quem está montando o conjunto quer a lista, não
    o primeiro erro.
    """
    fotos: list[FotoDoConjunto] = []
    problemas: list[str] = []

    for rotulo in rotulos:
        caminho = _arquivo_da_foto(rotulo.id, imagens)
        if caminho is None:
            extensoes = "|".join(sorted(EXTENSOES))
            problemas.append(f"{rotulo.id}: nenhuma imagem em {imagens}/{rotulo.id}[{extensoes}]")
            continue
        digest = hashlib.sha256(caminho.read_bytes()).hexdigest()
        if digest != rotulo.sha256:
            problemas.append(
                f"{rotulo.id}: sha256 não confere (manifesto {rotulo.sha256[:12]}…, "
                f"arquivo {digest[:12]}…)"
            )
            continue
        fotos.append(
            FotoDoConjunto(
                rotulo=rotulo,
                caminho=caminho,
                media_type=EXTENSOES[caminho.suffix.lower()],
            )
        )

    if problemas:
        raise ErroDeManifesto(
            "O conjunto não bate com o manifesto:\n  - " + "\n  - ".join(problemas)
        )
    return fotos


def _arquivo_da_foto(foto_id: str, imagens: Path) -> Path | None:
    for extensao in EXTENSOES:
        candidato = imagens / f"{foto_id}{extensao}"
        if candidato.is_file():
            return candidato
    return None


def sha256_do_arquivo(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()
