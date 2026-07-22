"""
Streamlit UI for testing the Handwriting Analyzer microservice.

THIS IS A DEVELOPMENT TESTING TOOL ONLY.
Not part of the deployed product. Use this locally to verify the service works correctly
before integrating with the Node app.
"""
import streamlit as st
import requests
from PIL import Image
import io
import json

st.set_page_config(page_title="Handwriting Analyzer", layout="wide")
st.title("📝 NeuroSync Handwriting Analyzer")
st.markdown("*Development testing tool — local use only*")

# Service URL config
SERVICE_URL = st.sidebar.text_input(
    "Service URL",
    value="http://localhost:8001",
    help="URL of the handwriting analyzer service"
)

col1, col2 = st.columns(2)

with col1:
    st.subheader("Upload Image")
    uploaded_file = st.file_uploader(
        "Choose a handwriting image (JPEG, PNG, or WEBP)",
        type=["jpg", "jpeg", "png", "webp"],
        help="Upload a clear image of handwritten text"
    )
    
    if uploaded_file:
        image = Image.open(uploaded_file)
        st.image(image, caption="Uploaded image", use_container_width=True)
        file_size_mb = len(uploaded_file.getbuffer()) / (1024 * 1024)
        st.caption(f"File size: {file_size_mb:.2f} MB")

with col2:
    st.subheader("Analysis Results")
    
    if uploaded_file and st.button("🔍 Analyze", use_container_width=True):
        with st.spinner("Analyzing..."):
            try:
                # Call the microservice
                files = {"file": (uploaded_file.name, uploaded_file.getbuffer(), uploaded_file.type)}
                response = requests.post(f"{SERVICE_URL}/api/v1/analyze", files=files, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    
                    st.success("✓ Analysis complete")
                    
                    # Display results
                    with st.expander("Raw Response (JSON)", expanded=False):
                        st.json(result)
                    
                    st.markdown("---")
                    
                    st.markdown("### 📋 Literal Transcription")
                    st.code(result.get("literal_transcription", "N/A"))
                    
                    st.markdown("### ✨ AI Interpretation")
                    st.markdown(f"**Intended Text:** {result['ai_interpretation'].get('intended_text', 'N/A')}")
                    
                    st.markdown("**Pattern Analysis:**")
                    for pattern in result['ai_interpretation'].get('pattern_analysis', []):
                        st.markdown(f"- {pattern}")
                else:
                    st.error(f"Error: {response.status_code}")
                    try:
                        error_detail = response.json().get("detail", response.text)
                        st.code(error_detail)
                    except:
                        st.code(response.text)
                        
            except requests.exceptions.ConnectionError:
                st.error(f"❌ Could not connect to service at {SERVICE_URL}")
                st.info("Make sure the service is running: `uvicorn app.main:app --host 0.0.0.0 --port 8001`")
            except Exception as e:
                st.error(f"Error: {str(e)}")

st.markdown("---")
st.markdown("### How to run:")
st.code("cd handwriting-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8001", language="bash")
