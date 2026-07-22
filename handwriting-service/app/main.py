"""Main FastAPI application"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import ALLOWED_ORIGINS
from app.api.routes import router

app = FastAPI(
    title="NeuroSync Handwriting Analyzer",
    description="Microservice for analyzing handwritten text using Mistral vision",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "service": "NeuroSync Handwriting Analyzer",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
