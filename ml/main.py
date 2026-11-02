from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from io import BytesIO

app = FastAPI(title="NeuroSync ML Sidecar")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/embed")
async def embed_audio(file: UploadFile = File(...)):
    """
    Compute MFCC embeddings for audio file
    """
    try:
        import librosa
        
        # Read audio file
        contents = await file.read()
        audio_data, sr = librosa.load(BytesIO(contents), sr=None)
        
        # Compute MFCCs
        mfcc = librosa.feature.mfcc(y=audio_data, sr=sr, n_mfcc=13)
        embedding = np.mean(mfcc, axis=1).tolist()
        
        return {"embedding": embedding, "shape": mfcc.shape}
    except Exception as e:
        return {"error": str(e)}

@app.post("/classify")
async def classify_cue(embedding: list):
    """
    Classify audio embedding using nearest centroid
    """
    try:
        # Placeholder for classification logic
        return {
            "label": "cue_detected",
            "confidence": 0.95,
            "timestamp": None
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
