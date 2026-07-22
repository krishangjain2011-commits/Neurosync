"""Tests for handwriting analyzer"""
import io
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image


def test_config_missing_api_key():
    """Test that analysis raises a clear error when MISTRAL_API_KEY is missing"""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {}, clear=True):
        import app.config
        from app.core.vision_ocr import analyze_handwriting

    img = Image.new("RGB", (100, 100), color="white")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    with pytest.raises(ValueError, match="Mistral API key is not configured"):
        analyze_handwriting(img_bytes.getvalue())


def test_analyze_invalid_image():
    """Test that invalid image raises ValueError"""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {"MISTRAL_API_KEY": "dummy"}, clear=True):
        from app.core.vision_ocr import analyze_handwriting

    invalid_bytes = b"not an image"

    with pytest.raises(ValueError, match="Invalid or corrupted image file"):
        analyze_handwriting(invalid_bytes)


def test_missing_api_key_fallback_mode_returns_placeholder_response():
    """Test that fallback mode returns a usable placeholder response instead of failing."""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {"MISTRAL_API_KEY": "", "HANDWRITING_FALLBACK_MODE": "true"}, clear=True):
        from app.core.vision_ocr import analyze_handwriting

    img = Image.new("RGB", (100, 100), color="white")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    result = analyze_handwriting(img_bytes.getvalue())

    assert result["literal_transcription"] == "Image received for handwriting analysis"
    assert result["intended_text"] == "Image received for handwriting analysis"
    assert "fallback" in result["pattern_analysis"][0].lower()


def test_analyze_with_mock_mistral():
    """Test analyze_handwriting with mocked Mistral response"""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {"MISTRAL_API_KEY": "fake-key-for-tests"}, clear=True):
        from app.core.vision_ocr import analyze_handwriting

    img = Image.new("RGB", (100, 100), color="white")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    with patch("app.core.vision_ocr.client") as mock_client:
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content='{"literal_transcription": "teh quick brown fox", "intended_text": "the quick brown fox", "pattern_analysis": ["letter inversion \'e\' and \'h\'", "irregular spacing"]}'))]
        mock_client.chat.complete.return_value = mock_response

        result = analyze_handwriting(img_bytes.getvalue())

        assert result["literal_transcription"] == "teh quick brown fox"
        assert result["intended_text"] == "the quick brown fox"
        assert len(result["pattern_analysis"]) == 2


def test_provider_error_falls_back_when_enabled():
    """Test that provider auth/rate errors use the fallback response when enabled."""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {"MISTRAL_API_KEY": "fake-key-for-tests", "HANDWRITING_FALLBACK_MODE": "true"}, clear=True):
        from app.core.vision_ocr import analyze_handwriting

    img = Image.new("RGB", (100, 100), color="white")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    with patch("app.core.vision_ocr.client") as mock_client:
        mock_client.chat.complete.side_effect = Exception("API error occurred: Status 401\n{\"detail\":\"Unauthorized\"}")

        result = analyze_handwriting(img_bytes.getvalue())

    assert result["literal_transcription"] == "Image received for handwriting analysis"
    assert result["intended_text"] == "Image received for handwriting analysis"
    assert "fallback" in result["pattern_analysis"][0].lower()


def test_placeholder_api_key_is_rejected_cleanly():
    """Test that placeholder API keys return a clear configuration error"""
    sys.modules.pop("app.config", None)
    sys.modules.pop("app.core.vision_ocr", None)
    with patch.dict(os.environ, {"MISTRAL_API_KEY": "your_mistral_api_key_here"}, clear=True):
        from app.core.vision_ocr import analyze_handwriting

    img = Image.new("RGB", (100, 100), color="white")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    with pytest.raises(ValueError, match="Mistral API key is not configured"):
        analyze_handwriting(img_bytes.getvalue())
