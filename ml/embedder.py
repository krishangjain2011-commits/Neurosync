"""
embedder.py — MFCC + delta feature extraction for NeuroSync audio files.

Produces a 124-dimensional feature vector:
  - 40 MFCCs (mean over time)
  - 40 delta MFCCs (mean over time)
  - 40 delta-delta MFCCs (mean over time)
  - RMS energy mean
  - Spectral centroid mean
  - Zero crossing rate mean
  - Tempo
  = 124 total features

Model name: "mfcc-delta-v1"
"""

import os
import subprocess
import tempfile
import numpy as np
import librosa

MODEL_NAME = "mfcc-delta-v1"
N_MFCC = 40

# Use FFMPEG_PATH env var if set — avoids PATH issues when launched from Node.js
_FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")


def _to_wav(audio_path: str) -> tuple[str, bool]:
    """
    If the file is not a WAV, transcode it to a temporary WAV using ffmpeg.
    Returns (path_to_use, is_temp) — caller must delete the temp file if is_temp is True.
    """
    ext = os.path.splitext(audio_path)[1].lower()
    if ext in ('.wav',):
        return audio_path, False

    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tmp_path = tmp.name
    tmp.close()

    result = subprocess.run(
        [_FFMPEG, '-y', '-i', audio_path, '-ar', '22050', '-ac', '1', '-f', 'wav', tmp_path],
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        os.unlink(tmp_path)
        stderr = result.stderr.decode('utf-8', errors='replace')
        raise RuntimeError(f"ffmpeg transcoding failed: {stderr[-400:]}")

    return tmp_path, True


def extract_embedding(audio_path: str) -> list[float]:
    """
    Load an audio file and extract a 124-dimensional feature vector.
    Non-WAV files (e.g. WebM/Opus from the browser) are transcoded to WAV first.

    Args:
        audio_path: Path to the audio file (any format ffmpeg supports)

    Returns:
        A plain Python list of 124 floats.
    """
    wav_path, is_temp = _to_wav(audio_path)
    try:
        y, sr = librosa.load(wav_path, sr=22050, mono=True)
    finally:
        if is_temp:
            try:
                os.unlink(wav_path)
            except OSError:
                pass

    # MFCCs
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC)
    delta_mfccs = librosa.feature.delta(mfccs)
    delta2_mfccs = librosa.feature.delta(mfccs, order=2)

    mfcc_mean = np.mean(mfccs, axis=1)
    delta_mean = np.mean(delta_mfccs, axis=1)
    delta2_mean = np.mean(delta2_mfccs, axis=1)

    rms = np.mean(librosa.feature.rms(y=y))
    spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
    zcr = np.mean(librosa.feature.zero_crossing_rate(y))
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo_val = float(np.atleast_1d(tempo)[0])

    vector = np.concatenate([
        mfcc_mean,
        delta_mean,
        delta2_mean,
        [rms, spectral_centroid, zcr, tempo_val],
    ])

    return vector.tolist()
