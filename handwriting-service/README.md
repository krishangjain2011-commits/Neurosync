# NeuroSync Handwriting Analyzer Microservice

Stateless Python microservice for analyzing handwritten text using Google Gemini vision. Designed to be called by the Node/Express backend.

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy .env and add your GOOGLE_API_KEY
cp .env.example .env
```

## Running the Service

```bash
# Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8001

# Service will be available at http://localhost:8001
# API docs at http://localhost:8001/docs
```

## Testing Locally

### Via Streamlit (interactive UI):
```bash
streamlit run frontend/app.py
```

### Via curl:
```bash
curl -X POST http://localhost:8001/api/v1/analyze \
  -F "file=@test_handwriting.jpg"
```

### Via pytest:
```bash
pytest tests/
```

## API Endpoint

**POST /api/v1/analyze**

Accepts: JPEG, PNG, or WEBP images (max 10MB)

Response:
```json
{
  "status": "success",
  "literal_transcription": "exact text as written",
  "ai_interpretation": {
    "intended_text": "corrected text",
    "pattern_analysis": ["pattern 1", "pattern 2"]
  }
}
```

## Architecture

- **app/main.py**: FastAPI application with CORS
- **app/config.py**: Configuration and validation
- **app/core/gemini_ocr.py**: Gemini vision integration
- **app/api/routes.py**: API endpoints
- **frontend/app.py**: Streamlit testing UI (dev only)

## Notes

- Service is completely stateless — no database, no session storage, no child/consent logic
- Image processing is done in-memory only
- All analysis happens via Gemini API
- CORS is configured to allow requests from the Node app (default: http://localhost:3000)
