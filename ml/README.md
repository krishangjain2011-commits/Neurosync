# NeuroSync ML Sidecar

FastAPI service that provides real MFCC audio embeddings using librosa.
The Node.js server calls this for teach/recognize operations.

## Requirements
- Python 3.11+
- ffmpeg (for WebM/Opus decoding)

## Setup

```bash
cd ml
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

## Endpoints

- `POST /embed` — Upload audio file, returns 124-dim MFCC+delta vector
- `POST /predict` — Run nearest-centroid prediction for a profile
- `POST /retrain` — Fit and save classifier for a profile
- `GET /health` — Health check

## Notes

- The Node server connects to this at `ML_SIDECAR_URL` (default: `http://localhost:8000`)
- If the sidecar is not running, the Node server falls back to Gemini multimodal analysis
- Model files are saved to `ml/models/<childId>.json`
