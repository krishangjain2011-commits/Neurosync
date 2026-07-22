"""API routes for handwriting analysis"""
from fastapi import APIRouter, File, UploadFile, HTTPException
from app.core.vision_ocr import analyze_handwriting
from app.config import SUPPORTED_FORMATS, MAX_FILE_SIZE

router = APIRouter(prefix="/api/v1", tags=["handwriting"])


@router.post("/analyze")
async def analyze_handwriting_endpoint(file: UploadFile = File(...)):
    """
    Analyze handwriting from an uploaded image.
    
    Accepts: JPEG, PNG, or WEBP images up to 10MB
    
    Returns:
        {
            "status": "success",
            "literal_transcription": "...",
            "ai_interpretation": {
                "intended_text": "...",
                "pattern_analysis": ["..."]
            }
        }
    """
    # Validate file type
    print(f"[DEBUG] Received file: {file.filename}, content_type: {file.content_type}")
    
    if file.content_type not in SUPPORTED_FORMATS:
        print(f"[DEBUG] SUPPORTED_FORMATS: {SUPPORTED_FORMATS}")
        print(f"[DEBUG] Received content_type: {file.content_type}")
        # Allow any image/* type as a fallback
        if not (file.content_type and file.content_type.startswith("image/")):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported image format: {file.content_type}. "
                       f"Supported: {', '.join(SUPPORTED_FORMATS)}"
            )
    
    # Read and validate file size
    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read uploaded file: {str(e)}"
        )
    
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    
    # Analyze with Mistral
    try:
        result = analyze_handwriting(image_bytes)
        return {
            "status": "success",
            "literal_transcription": result["literal_transcription"],
            "ai_interpretation": {
                "intended_text": result["intended_text"],
                "pattern_analysis": result["pattern_analysis"],
            }
        }
    except ValueError as e:
        message = str(e)
        if "rate-limited" in message:
            raise HTTPException(status_code=429, detail=message)
        raise HTTPException(
            status_code=400,
            detail=f"Analysis failed: {message}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "handwriting-analyzer"}
