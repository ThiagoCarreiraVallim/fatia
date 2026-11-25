"""A duração do áudio do ditado, lida do contêiner, sem decodificar nada (#488).

Desde a #488 a transcrição é cobrada em tokens de áudio, proporcionais à **duração**, e o teto de
bytes da rota deixou de limitar o custo: 1,3 MB de opus a 6 kbps são 30 minutos. O app para em
2 min, mas isso vale só no cliente.

Estimar pelo tamanho com uma taxa mínima não serve: o app grava AAC a 128 kbps (2 min ≈ 1,9 MB), e
um teto que deixa isso passar deixa passar 40 min de opus a 6 kbps. Então a duração sai do
contêiner, que cada formato declara de um jeito:

- **MP4/M4A** (o app, e o Safari): `mvhd`; gravação fragmentada (o `MediaRecorder` do Safari) tem
  `mvhd` zerado, e aí soma as amostras dos `trun`.
- **WebM** (Chrome, Firefox): o `Duration` do `Info`; o `MediaRecorder` não o escreve, e aí vale o
  maior tempo de bloco dos `Cluster`.
- **Ogg** (Firefox): o `granule` da última página, menos o `pre-skip` do Opus.
- **WAV**, **AAC (ADTS)** e **MP3**: cabeçalho e quadros.

O formato é reconhecido pelos bytes, e não pelo `Content-Type`: um rótulo errado não pode escolher o
leitor errado. Quando não dá para ler, devolve `None` e quem chama decide — a rota mantém só o teto
de bytes, porque recusar um áudio legítimo que este leitor não entendeu derrubaria o ditado.

**Não é defesa contra arquivo forjado.** O contêiner declara a própria duração, e quem monta o
arquivo à mão pode mentir. O que segura esse caso é o resto: o teto de bytes, e o consumo em tokens
que volta do provedor e entra na cota de quem ditou.
"""

import math
import struct
from collections.abc import Callable, Iterator

# --- MP4 -------------------------------------------------------------------------------------


def _boxes(data: bytes, start: int, end: int) -> Iterator[tuple[bytes, int, int]]:
    """(tipo, início do conteúdo, fim) de cada caixa entre `start` e `end`."""
    i = start
    while i + 8 <= end:
        (tamanho,) = struct.unpack_from(">I", data, i)
        tipo = data[i + 4 : i + 8]
        cabecalho = 8
        if tamanho == 1:
            (tamanho,) = struct.unpack_from(">Q", data, i + 8)
            cabecalho = 16
        elif tamanho == 0:
            tamanho = end - i
        if tamanho < cabecalho:
            return
        yield tipo, i + cabecalho, min(i + tamanho, end)
        i += tamanho


def _caixa(data: bytes, start: int, end: int, *caminho: bytes) -> tuple[int, int] | None:
    for tipo in caminho:
        achada = next(((s, e) for t, s, e in _boxes(data, start, end) if t == tipo), None)
        if achada is None:
            return None
        start, end = achada
    return start, end


def _mp4(data: bytes) -> float | None:
    moov = _caixa(data, 0, len(data), b"moov")
    if moov is None:
        return None

    mvhd = _caixa(data, *moov, b"mvhd")
    if mvhd is not None:
        s = mvhd[0]
        escala, duracao = (
            struct.unpack_from(">IQ", data, s + 20)
            if data[s] == 1
            else struct.unpack_from(">II", data, s + 12)
        )
        if escala and duracao and duracao not in (0xFFFFFFFF, 0xFFFFFFFFFFFFFFFF):
            return float(duracao / escala)

    # Fragmentado: as durações estão nos `trun`, na escala de tempo da trilha (`mdhd`).
    mdhd = _caixa(data, *moov, b"trak", b"mdia", b"mdhd")
    if mdhd is None:
        return None
    s = mdhd[0]
    (escala,) = struct.unpack_from(">I", data, s + (20 if data[s] == 1 else 12))
    trex = _caixa(data, *moov, b"mvex", b"trex")
    padrao_trex = struct.unpack_from(">I", data, trex[0] + 12)[0] if trex else 0

    total = 0
    for tipo, inicio, fim in _boxes(data, 0, len(data)):
        if tipo != b"moof":
            continue
        for tipo_traf, s_traf, e_traf in _boxes(data, inicio, fim):
            if tipo_traf != b"traf":
                continue
            padrao = padrao_trex
            for t, s, _e in _boxes(data, s_traf, e_traf):
                flags = int.from_bytes(data[s + 1 : s + 4], "big")
                if t == b"tfhd" and flags & 0x08:
                    pos = s + 8 + (8 if flags & 0x01 else 0) + (4 if flags & 0x02 else 0)
                    (padrao,) = struct.unpack_from(">I", data, pos)
                elif t == b"trun":
                    (amostras,) = struct.unpack_from(">I", data, s + 4)
                    if not flags & 0x100:
                        total += amostras * padrao
                        continue
                    pos = s + 8 + (4 if flags & 0x01 else 0) + (4 if flags & 0x04 else 0)
                    passo = 4 * sum(1 for bit in (0x100, 0x200, 0x400, 0x800) if flags & bit)
                    for _ in range(amostras):
                        total += struct.unpack_from(">I", data, pos)[0]
                        pos += passo
    return total / escala if escala and total else None


# --- Matroska / WebM -------------------------------------------------------------------------

_SEGMENT = 0x18538067
_INFO = 0x1549A966
_TIMECODE_SCALE = 0x2AD7B1
_DURATION = 0x4489
_CLUSTER = 0x1F43B675
_TIMECODE = 0xE7
_SIMPLE_BLOCK = 0xA3
_BLOCK_GROUP = 0xA0
_BLOCK = 0xA1


def _vint(data: bytes, i: int, *, marcador: bool) -> tuple[int, int, bool]:
    """(valor, comprimento, tamanho desconhecido) de um inteiro de tamanho variável do EBML."""
    primeiro = data[i]
    comprimento, mascara = 1, 0x80
    while comprimento <= 8 and not primeiro & mascara:
        mascara >>= 1
        comprimento += 1
    if comprimento > 8:
        raise ValueError("vint inválido")
    valor = primeiro if marcador else primeiro & (mascara - 1)
    for byte in data[i + 1 : i + comprimento]:
        valor = (valor << 8) | byte
    desconhecido = not marcador and valor == (1 << (7 * comprimento)) - 1
    return valor, comprimento, desconhecido


def _uint(data: bytes, inicio: int, fim: int) -> int:
    return int.from_bytes(data[inicio:fim], "big")


def _webm(data: bytes) -> float | None:
    n = len(data)
    # O cabeçalho EBML, e depois o Segment.
    _, li, _ = _vint(data, 0, marcador=True)
    tamanho, lt, _ = _vint(data, li, marcador=False)
    i = li + lt + tamanho
    ident, li, _ = _vint(data, i, marcador=True)
    if ident != _SEGMENT:
        return None
    tamanho, lt, desconhecido = _vint(data, i + li, marcador=False)
    i += li + lt
    fim = n if desconhecido else min(n, i + tamanho)

    escala = 1_000_000
    declarada: float | None = None
    cluster = 0
    ultimo: int | None = None
    # Uma leitura só, plana: `Cluster` e `BlockGroup` não são pulados, os filhos deles vêm em
    # seguida. Assim o `Cluster` de tamanho desconhecido (o do `MediaRecorder`) termina sozinho
    # onde começa o próximo.
    while i < fim:
        ident, li, _ = _vint(data, i, marcador=True)
        tamanho, lt, desconhecido = _vint(data, i + li, marcador=False)
        corpo = i + li + lt
        if ident in (_CLUSTER, _BLOCK_GROUP):
            i = corpo
            continue
        if desconhecido:
            break
        if ident == _INFO:
            j = corpo
            while j < corpo + tamanho:
                filho, lf, _ = _vint(data, j, marcador=True)
                tf, ltf, _ = _vint(data, j + lf, marcador=False)
                c = j + lf + ltf
                if filho == _TIMECODE_SCALE:
                    escala = _uint(data, c, c + tf) or escala
                elif filho == _DURATION and tf in (4, 8):
                    (declarada,) = struct.unpack_from(">f" if tf == 4 else ">d", data, c)
                j = c + tf
        elif ident == _TIMECODE:
            cluster = _uint(data, corpo, corpo + tamanho)
        elif ident in (_SIMPLE_BLOCK, _BLOCK):
            _, lp, _ = _vint(data, corpo, marcador=False)
            (relativo,) = struct.unpack_from(">h", data, corpo + lp)
            momento = cluster + relativo
            ultimo = momento if ultimo is None else max(ultimo, momento)
        i = corpo + tamanho

    if declarada:
        return declarada * escala / 1e9
    return ultimo * escala / 1e9 if ultimo is not None else None


# --- Ogg -------------------------------------------------------------------------------------


def _ogg(data: bytes) -> float | None:
    segmentos = data[26]
    pacote = 27 + segmentos
    if data[pacote : pacote + 8] == b"OpusHead":
        taxa = 48_000
        (pre_skip,) = struct.unpack_from("<H", data, pacote + 10)
    elif data[pacote : pacote + 7] == b"\x01vorbis":
        (taxa,) = struct.unpack_from("<I", data, pacote + 12)
        pre_skip = 0
    else:
        return None

    fim = len(data)
    while (pagina := data.rfind(b"OggS", 0, fim)) >= 0:
        (granule,) = struct.unpack_from("<q", data, pagina + 6)
        if granule >= 0:
            return max(0, granule - pre_skip) / taxa if taxa else None
        fim = pagina
    return None


# --- WAV -------------------------------------------------------------------------------------


def _wav(data: bytes) -> float | None:
    taxa_de_bytes = 0
    i = 12
    while i + 8 <= len(data):
        tipo = data[i : i + 4]
        (tamanho,) = struct.unpack_from("<I", data, i + 4)
        if tipo == b"fmt ":
            (taxa_de_bytes,) = struct.unpack_from("<I", data, i + 16)
        elif tipo == b"data":
            restante = len(data) - (i + 8)
            # Gravação em fluxo escreve o tamanho como 0 ou 0xFFFFFFFF.
            tamanho = restante if tamanho in (0, 0xFFFFFFFF) else min(tamanho, restante)
            return tamanho / taxa_de_bytes if taxa_de_bytes else None
        i += 8 + tamanho + (tamanho & 1)
    return None


# --- AAC (ADTS) e MP3 ------------------------------------------------------------------------

_AAC_TAXAS = (96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000)
_MP3_KBPS = {
    3: (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320),
    2: (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160),
}
_MP3_TAXAS = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def _depois_do_id3(data: bytes) -> int:
    if data[:3] != b"ID3":
        return 0
    return 10 + sum((b & 0x7F) << (7 * (3 - k)) for k, b in enumerate(data[6:10]))


def _eh_adts(data: bytes, i: int) -> bool:
    return data[i] == 0xFF and data[i + 1] & 0xF6 == 0xF0


def _aac(data: bytes) -> float | None:
    i = _depois_do_id3(data)
    segundos = 0.0
    while i + 7 <= len(data) and _eh_adts(data, i):
        indice = (data[i + 2] >> 2) & 0x0F
        comprimento = ((data[i + 3] & 0x03) << 11) | (data[i + 4] << 3) | (data[i + 5] >> 5)
        if indice >= len(_AAC_TAXAS) or comprimento < 7:
            break
        segundos += 1024 * ((data[i + 6] & 0x03) + 1) / _AAC_TAXAS[indice]
        i += comprimento
    return segundos or None


def _mp3(data: bytes) -> float | None:
    i = _depois_do_id3(data)
    segundos = 0.0
    while i + 4 <= len(data) and data[i] == 0xFF and data[i + 1] & 0xE0 == 0xE0:
        versao = (data[i + 1] >> 3) & 0x03
        camada = (data[i + 1] >> 1) & 0x03
        indice_kbps = data[i + 2] >> 4
        indice_taxa = (data[i + 2] >> 2) & 0x03
        if camada != 1 or versao == 1 or indice_kbps in (0, 15) or indice_taxa == 3:
            break
        kbps = _MP3_KBPS[3 if versao == 3 else 2][indice_kbps]
        taxa = _MP3_TAXAS[versao][indice_taxa]
        amostras = 1152 if versao == 3 else 576
        segundos += amostras / taxa
        i += amostras // 8 * kbps * 1000 // taxa + ((data[i + 2] >> 1) & 0x01)
    return segundos or None


# --- entrada ---------------------------------------------------------------------------------


def _leitor(data: bytes) -> Callable[[bytes], float | None] | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return _wav
    if data[:4] == b"OggS":
        return _ogg
    if data[:4] == b"\x1aE\xdf\xa3":
        return _webm
    if data[4:8] in (b"ftyp", b"moov", b"mdat", b"free", b"wide", b"skip"):
        return _mp4
    i = _depois_do_id3(data)
    if i + 2 <= len(data) and _eh_adts(data, i):
        return _aac
    if i + 2 <= len(data) and data[i] == 0xFF and data[i + 1] & 0xE0 == 0xE0:
        return _mp3
    return None


def audio_duration_seconds(audio: bytes) -> float | None:
    """Segundos de áudio que o contêiner declara; `None` quando o formato não dá para ler."""
    if len(audio) < 12:
        return None
    leitor = _leitor(audio)
    if leitor is None:
        return None
    try:
        segundos = leitor(audio)
    except (struct.error, IndexError, ValueError, OverflowError, ZeroDivisionError):
        return None
    if segundos is None or not math.isfinite(segundos) or segundos < 0:
        return None
    return segundos


__all__ = ["audio_duration_seconds"]
