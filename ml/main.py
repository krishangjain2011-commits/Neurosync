"""
main.py — FastAPI ML sidecar for NeuroSync.

Endpoints:
  POST /embed    — Extract MFCC embedding from an uploaded audio file
  POST /predict  — Run nearest-centroid prediction for a profile
  POST /retrain  — Fit and save a classifier for a profile
  GET  /health   — Health check
"""

import os
import tempfile
from typing import Optional

# Load .env from parent directory (neurosync root) so FFMPEG_PATH etc. are available
_env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(_env_file):
    with open(_env_file, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _, _v = _line.partition("=")
            _k = _k.strip()
            _v = _v.strip().strip('"').strip("'")
            if _k and _k not in os.environ:
                os.environ[_k] = _v

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from embedder import extract_embedding, MODEL_NAME
from classifier import PrototypeClassifier

app = FastAPI(title="NeuroSync ML Sidecar", version="1.0.0")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)


def model_path_for(profile_id: str) -> str:
    return os.path.join(MODELS_DIR, f"{profile_id}.json")


# ─── Request / Response schemas ────────────────────────────────────────────────

class MeaningItem(BaseModel):
    id: str
    title: str


class PredictRequest(BaseModel):
    profileId: str
    embeddingVector: list[float]
    meanings: list[MeaningItem]


class TrainingExample(BaseModel):
    embeddingVector: list[float]
    meaningId: str


class RetrainRequest(BaseModel):
    profileId: str
    trainingData: list[TrainingExample]


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Simple health check."""
    return {"status": "ok"}


@app.post("/embed")
async def embed(audio: UploadFile = File(...)):
    """
    Accept an audio file, extract a 124-dim MFCC+delta embedding, return as JSON.
    The file is saved to a temp path, processed, then deleted.
    """
    # Write to a temporary file
    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        content = await audio.read()
        tmp.write(content)

    try:
        vector = extract_embedding(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Embedding extraction failed: {str(e)}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {"vector": vector, "model": MODEL_NAME}


@app.post("/predict")
def predict(req: PredictRequest):
    """
    Load the classifier for a profile and return top-N predictions.
    Returns { error: "no_model" } if the model has not been trained yet.
    """
    path = model_path_for(req.profileId)

    if not os.path.exists(path):
        return JSONResponse(
            status_code=200,
            content={
                "error": "no_model",
                "message": f"No trained model found for profile {req.profileId}. "
                           "Please complete the training phase and retrain first.",
            },
        )

    clf = PrototypeClassifier()
    try:
        clf.load(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")

    if not clf.is_trained():
        return JSONResponse(
            status_code=200,
            content={
                "error": "no_model",
                "message": "Model file exists but contains no trained centroids.",
            },
        )

    try:
        results = clf.predict(req.embeddingVector, top_n=3)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Prediction failed: {str(e)}")

    if not results:
        raise HTTPException(status_code=422, detail="Prediction returned no results")

    top = results[0]
    alternatives = results[1:]

    return {
        "topMeaningId": top["meaningId"],
        "topConfidence": top["confidence"],
        "alternatives": [
            {"meaningId": r["meaningId"], "confidence": r["confidence"]}
            for r in alternatives
        ],
    }


@app.post("/retrain")
def retrain(req: RetrainRequest):
    """
    Fit a new PrototypeClassifier on the provided training data and persist it.
    Returns { modelPath, examplesCount, meaningCount }.
    """
    if not req.trainingData:
        raise HTTPException(status_code=422, detail="trainingData must not be empty")

    embeddings = [ex.embeddingVector for ex in req.trainingData]
    meaning_ids = [ex.meaningId for ex in req.trainingData]

    clf = PrototypeClassifier()
    try:
        clf.fit(embeddings, meaning_ids)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Training failed: {str(e)}")

    path = model_path_for(req.profileId)
    try:
        clf.save(path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save model: {str(e)}")

    unique_meanings = len(set(meaning_ids))

    return {
        "modelPath": path,
        "examplesCount": len(req.trainingData),
        "meaningCount": unique_meanings,
    }
