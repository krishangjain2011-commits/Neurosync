import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("MISTRAL_API_KEY", "dummy")

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=False)
