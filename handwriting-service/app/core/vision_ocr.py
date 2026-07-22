"""Mistral OCR analyzer for handwriting using Mistral's vision-capable models."""
import base64
import io
import json
import re

from PIL import Image
from mistralai import Mistral

from app.config import MISTRAL_API_KEY, HANDWRITING_FALLBACK_MODE, has_valid_mistral_api_key

client = Mistral(api_key=MISTRAL_API_KEY) if MISTRAL_API_KEY else None

HANDWRITING_PROMPT = """You are an expert assistive vision model specializing in analyzing handwritten text by individuals with dyslexia and dysgraphia.

Process the provided image and extract information strictly into these two categories:

1. LITERAL TRANSCRIPTION:
   - Perform exact character-for-character extraction.
   - DO NOT auto-correct spelling, inverted/mirrored characters (e.g. 'b' vs 'd', 'p' vs 'q'), or missing letters.
   - Preserve what is visually printed on paper word-for-word.

2. AI INTERPRETATION:
   - Intended Meaning: Rewrite the text into standard, grammatically correct English based on phonetic and contextual clues.
   - Handwriting Pattern Analysis: Provide bullet points detailing observed writing traits (e.g. character flips, phonetic substitutions like 'fren' -> 'friend', irregular spacing, dropped consonants).

Never state a diagnosis or severity assessment — only describe what is observed in this specific sample.

Output ONLY a JSON object (no other text) with this structure:
{
  "literal_transcription": "exact text as written, preserving errors",
  "intended_text": "corrected, grammatically proper interpretation",
  "pattern_analysis": [
    "observed trait 1",
    "observed trait 2",
    "etc"
  ]
}
"""


def _mime_type_for_image(image: Image.Image) -> str:
    fmt = (image.format or "PNG").upper()
    return {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(fmt, "image/png")


def analyze_handwriting(image_bytes: bytes) -> dict:
    """
    Analyze handwriting from image bytes using Mistral vision.

    Args:
        image_bytes: Raw image data (JPEG, PNG, or WEBP)

    Returns:
        dict with keys: literal_transcription, intended_text, pattern_analysis

    Raises:
        ValueError: If image is invalid or analysis fails
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        if image.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError(f"Unsupported image format: {image.format}")

        if not has_valid_mistral_api_key():
            if HANDWRITING_FALLBACK_MODE:
                return {
                    "literal_transcription": "Image received for handwriting analysis",
                    "intended_text": "Image received for handwriting analysis",
                    "pattern_analysis": ["fallback mode enabled; no live Mistral analysis available"],
                }
            raise ValueError("Mistral API key is not configured. Please set a real MISTRAL_API_KEY in the environment.")

        image_bytes_for_b64 = image_bytes
        mime_type = _mime_type_for_image(image)
        encoded_image = base64.b64encode(image_bytes_for_b64).decode("utf-8")
        data_url = f"data:{mime_type};base64,{encoded_image}"

        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": HANDWRITING_PROMPT},
                        {"type": "image_url", "image_url": data_url},
                    ],
                }
            ],
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content
        if isinstance(raw_text, list):
            raw_text = "".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in raw_text
            )
        elif isinstance(raw_text, dict):
            raw_text = raw_text.get("content") or raw_text.get("text") or str(raw_text)

        json_match = re.search(r"\{.*\}", str(raw_text), re.DOTALL)
        if not json_match:
            raise ValueError(f"No JSON found in Mistral response: {str(raw_text)[:200]}")

        result = json.loads(json_match.group())

        required_keys = {"literal_transcription", "intended_text", "pattern_analysis"}
        if not all(key in result for key in required_keys):
            raise ValueError(f"Response missing required keys. Got: {result.keys()}")

        if not isinstance(result["pattern_analysis"], list):
            result["pattern_analysis"] = [str(result["pattern_analysis"])]

        return {
            "literal_transcription": str(result["literal_transcription"]),
            "intended_text": str(result["intended_text"]),
            "pattern_analysis": result["pattern_analysis"],
        }
    except Image.UnidentifiedImageError as exc:
        raise ValueError("Invalid or corrupted image file") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse Mistral response as JSON: {exc}") from exc
    except Exception as exc:
        status_code = getattr(exc, "status_code", None) or getattr(exc, "status", None)
        error_text = str(exc).lower()
        if status_code == 429 or "429" in error_text or "rate limit" in error_text:
            if HANDWRITING_FALLBACK_MODE:
                return {
                    "literal_transcription": "Image received for handwriting analysis",
                    "intended_text": "Image received for handwriting analysis",
                    "pattern_analysis": ["fallback mode enabled; provider returned a rate-limit response"],
                }
            raise ValueError(
                "handwriting analysis is temporarily rate-limited, please wait a moment and try again"
            ) from exc
        if HANDWRITING_FALLBACK_MODE and (
            "401" in error_text
            or "unauthorized" in error_text
            or "forbidden" in error_text
            or "authentication" in error_text
            or "api key" in error_text
        ):
            return {
                "literal_transcription": "Image received for handwriting analysis",
                "intended_text": "Image received for handwriting analysis",
                "pattern_analysis": ["fallback mode enabled; no live Mistral analysis available"],
            }
        raise ValueError(f"Mistral analysis failed: {exc}") from exc
