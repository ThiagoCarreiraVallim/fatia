"""A duração lida do contêiner, nos formatos que o app e os navegadores gravam (#488, PR #496).

Os áudios são gerados na hora pelo `ffmpeg`, com as mesmas formas que chegam de verdade: MP4
inteiro (o app), MP4 fragmentado (o `MediaRecorder` do Safari), WebM com e sem `Duration` (o do
Chrome não escreve), Ogg/Opus (Firefox), WAV, AAC cru e MP3. Sem `ffmpeg` na máquina, pulam.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

from fatia_agent.audio_duration import audio_duration_seconds

FFMPEG = shutil.which("ffmpeg")

# Os argumentos de codificação de cada forma, como o ffmpeg as escreve.
FORMAS = {
    "app.m4a": ["-c:a", "aac", "-b:a", "16k"],
    "safari.mp4": [
        "-c:a",
        "aac",
        "-b:a",
        "16k",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "-f",
        "mp4",
    ],
    "chrome.webm": ["-c:a", "libopus", "-b:a", "6k", "-live", "1", "-f", "webm"],
    "com-duracao.webm": ["-c:a", "libopus", "-b:a", "6k"],
    "firefox.ogg": ["-c:a", "libopus", "-b:a", "6k"],
    "pcm.wav": ["-c:a", "pcm_s16le", "-ar", "8000"],
    "cru.aac": ["-c:a", "aac", "-b:a", "16k", "-f", "adts"],
    "audio.mp3": ["-c:a", "libmp3lame", "-b:a", "8k", "-ar", "8000"],
}


def _gerar(destino: Path, segundos: int, argumentos: list[str]) -> bytes:
    assert FFMPEG is not None
    subprocess.run(
        [
            FFMPEG,
            *("-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono"),
            *("-t", str(segundos), *argumentos, str(destino)),
        ],
        check=True,
    )
    return destino.read_bytes()


@pytest.mark.skipif(FFMPEG is None, reason="sem ffmpeg para gerar os áudios")
@pytest.mark.parametrize("nome", sorted(FORMAS))
@pytest.mark.parametrize("segundos", [5, 200])
def test_le_a_duracao_de_cada_forma_gravada(tmp_path: Path, nome: str, segundos: int) -> None:
    audio = _gerar(tmp_path / nome, segundos, FORMAS[nome])

    assert audio_duration_seconds(audio) == pytest.approx(segundos, abs=0.5)


@pytest.mark.parametrize(
    "lixo",
    [b"", b"\x1aE\xdf\xa3webm-de-mentira", b"OggS" + b"\0" * 40, b"\0" * 64, b"RIFF\0\0\0\0WAVE"],
)
def test_o_que_nao_da_para_ler_devolve_none(lixo: bytes) -> None:
    """Sem duração, quem decide é a rota; o leitor nunca levanta."""
    assert audio_duration_seconds(lixo) is None
