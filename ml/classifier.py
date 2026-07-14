"""
classifier.py — Prototype nearest-centroid classifier for NeuroSync.

Each meaning is represented by the centroid (mean) of all its training embeddings.
At prediction time, cosine similarity is computed against every centroid,
then softmax converts similarities to probabilities for interpretable confidence scores.
"""

import json
import math
import numpy as np
from typing import Optional


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a_arr = np.array(a, dtype=float)
    b_arr = np.array(b, dtype=float)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


def _softmax(values: list[float], temperature: float = 0.1) -> list[float]:
    """
    Compute temperature-scaled softmax over similarity scores.

    A low temperature (< 1.0) sharpens the distribution so that a clearly
    better match gets a much higher confidence score rather than being diluted
    by the number of classes. With temperature=0.1, cosine similarity
    differences of even ~0.05 produce meaningfully different probabilities.
    """
    arr = np.array(values, dtype=float)
    # Scale by temperature BEFORE softmax
    arr = arr / temperature
    # Subtract max for numerical stability
    arr -= arr.max()
    exp_arr = np.exp(arr)
    return (exp_arr / exp_arr.sum()).tolist()


class PrototypeClassifier:
    """
    Nearest-centroid classifier using cosine similarity.

    Centroids are stored as a dict: { meaning_id: centroid_vector (list[float]) }
    """

    def __init__(self):
        self._centroids: dict[str, list[float]] = {}

    def fit(self, embeddings: list[list[float]], meaning_ids: list[str]) -> None:
        """
        Compute one centroid per meaning from the provided embeddings.

        Args:
            embeddings: List of embedding vectors (each a list of floats)
            meaning_ids: Parallel list of meaning ID strings
        """
        if len(embeddings) != len(meaning_ids):
            raise ValueError("embeddings and meaning_ids must have the same length")

        # Group embeddings by meaning_id
        groups: dict[str, list[list[float]]] = {}
        for emb, mid in zip(embeddings, meaning_ids):
            groups.setdefault(mid, []).append(emb)

        # Compute centroid (mean) per group
        self._centroids = {}
        for mid, vecs in groups.items():
            centroid = np.mean(np.array(vecs, dtype=float), axis=0).tolist()
            self._centroids[mid] = centroid

    def predict(self, embedding: list[float], top_n: int = 3) -> list[dict]:
        """
        Predict the most likely meanings for a given embedding.

        Args:
            embedding: The query embedding vector
            top_n: Number of top results to return

        Returns:
            List of dicts [{ "meaningId": str, "confidence": float }]
            sorted by confidence descending (probabilities sum to ~1.0).
        """
        if not self._centroids:
            raise RuntimeError("Classifier has not been trained yet")

        meaning_ids = list(self._centroids.keys())
        similarities = [
            _cosine_similarity(embedding, self._centroids[mid])
            for mid in meaning_ids
        ]

        probabilities = _softmax(similarities)

        results = [
            {"meaningId": mid, "confidence": prob}
            for mid, prob in zip(meaning_ids, probabilities)
        ]

        # Sort descending by confidence
        results.sort(key=lambda x: x["confidence"], reverse=True)

        return results[:top_n]

    def save(self, path: str) -> None:
        """Serialize centroids to a JSON file."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self._centroids, f)

    def load(self, path: str) -> None:
        """Deserialize centroids from a JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            self._centroids = json.load(f)

    def is_trained(self) -> bool:
        """Return True if the classifier has at least one centroid."""
        return len(self._centroids) > 0
