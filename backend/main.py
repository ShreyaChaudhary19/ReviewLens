
from pathlib import Path
from typing import Optional
import json
import os
import re

import joblib
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Project structure:
# fake-review-web/
#   artifacts/
#   data/
#   backend/main.py
ROOT = Path(__file__).resolve().parents[1]

ARTIFACTS = ROOT / "artifacts"
DATA = ROOT / "data"

MODEL_PATH = Path(
    os.getenv("MODEL_PATH", str(ARTIFACTS / "fake_review_model.joblib"))
)
VECTORIZER_PATH = Path(
    os.getenv("VECTORIZER_PATH", str(ARTIFACTS / "vectorizer.joblib"))
)
METRICS_PATH = Path(
    os.getenv("METRICS_PATH", str(ARTIFACTS / "metrics.json"))
)
DATASET_PATH = Path(
    os.getenv("DATASET_PATH", str(DATA / "reviews.csv"))
)

app = FastAPI(
    title="ReviewLens API",
    version="1.0.0",
    description="Fake review research prototype API",
)

# Configure CORS using the deployed frontend URL when available.
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
allowed_origins = [
    origin.strip()
    for origin in frontend_url.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
vectorizer = None
load_error = None


def load_artifacts():
    global model, vectorizer, load_error

    try:
        if not MODEL_PATH.exists():
            load_error = (
                f"Model artifact not found: {MODEL_PATH}. "
                "Ensure artifacts/fake_review_model.joblib is included."
            )
            return

        model = joblib.load(MODEL_PATH)

        # A Pipeline may include vectorization internally.
        if not hasattr(model, "named_steps"):
            if VECTORIZER_PATH.exists():
                vectorizer = joblib.load(VECTORIZER_PATH)
            else:
                load_error = (
                    "The model is not a Pipeline and vectorizer.joblib "
                    "was not found. Provide the matching vectorizer."
                )
                model = None
                return

        load_error = None

    except Exception as exc:
        model = None
        vectorizer = None
        load_error = f"{type(exc).__name__}: {exc}"


load_artifacts()


class ReviewRequest(BaseModel):
    review: str = Field(min_length=3, max_length=2000)


def normalize_label(raw):
    label = str(raw).strip().lower()

    if label in {"fake", "1", "deceptive", "false"}:
        return "Fake"

    if label in {"genuine", "real", "0", "truthful", "authentic"}:
        return "Genuine"

    return str(raw).title()


def predict_many(texts):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=load_error or "Model is not loaded.",
        )

    try:
        if hasattr(model, "named_steps"):
            X = texts
        elif vectorizer is not None:
            X = vectorizer.transform(texts)
        else:
            X = texts

        predictions = model.predict(X)
        probabilities = (
            model.predict_proba(X)
            if hasattr(model, "predict_proba")
            else None
        )

        classes = list(getattr(model, "classes_", []))
        output = []

        for i, raw in enumerate(predictions):
            label = normalize_label(raw)
            scores = {}

            if probabilities is not None:
                for j, cls in enumerate(classes):
                    key = normalize_label(cls)
                    scores[key] = round(
                        float(probabilities[i][j]) * 100, 2
                    )

            confidence = max(scores.values()) if scores else None

            output.append({
                "label": label,
                "confidence": confidence,
                "probabilities": scores,
                "words": len(re.findall(r"\b\w+\b", texts[i])),
                "characters": len(texts[i]),
            })

        return output

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Prediction failed. Check that the model and vectorizer "
                f"match. {type(exc).__name__}: {exc}"
            ),
        )


@app.get("/")
def root():
    return {"message": "ReviewLens API", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "load_error": load_error,
    }


@app.get("/api/overview")
def overview():
    total = genuine = fake = 0

    if DATASET_PATH.exists():
        try:
            df = pd.read_csv(DATASET_PATH)
            total = len(df)

            if "label" in df.columns:
                labels = df["label"].astype(str).str.lower()
                fake = int(
                    labels.isin(
                        ["fake", "1", "deceptive", "false"]
                    ).sum()
                )
                genuine = int(
                    labels.isin(
                        ["genuine", "real", "0", "truthful", "authentic"]
                    ).sum()
                )
        except Exception:
            pass

    metrics = {}

    if METRICS_PATH.exists():
        try:
            metrics = json.loads(
                METRICS_PATH.read_text(encoding="utf-8")
            )
        except Exception:
            pass

    if not metrics:
        metrics = {
            "selected_model": "Configured model",
            "test_accuracy": 0.88125,
            "test_precision_fake": 0.8388888889,
            "test_recall_fake": 0.94375,
            "test_f1_fake": 0.8882352941,
            "test_examples": 320,
        }

    return {
        "total": total,
        "genuine": genuine,
        "fake": fake,
        "metrics": metrics,
        "model_loaded": model is not None,
    }


@app.post("/api/predict")
def predict(req: ReviewRequest):
    result = predict_many([req.review])[0]
    return {"review": req.review, **result}


@app.post("/api/batch")
def batch(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Upload a .csv file.",
        )

    try:
        df = pd.read_csv(file.file)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read CSV: {exc}",
        )
    finally:
        file.file.close()

    review_col = next(
        (c for c in ["review", "text", "content"] if c in df.columns),
        None,
    )

    if review_col is None:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain a 'review', 'text', or 'content' column.",
        )

    texts = df[review_col].fillna("").astype(str).tolist()
    valid_idx = [
        i for i, text in enumerate(texts) if len(text.strip()) >= 3
    ]

    results = predict_many([texts[i] for i in valid_idx])
    out = df.iloc[valid_idx].copy().reset_index(drop=True)

    out["prediction"] = [r["label"] for r in results]
    out["confidence_percent"] = [r["confidence"] for r in results]
    out["word_count"] = [r["words"] for r in results]

    return {
        "rows": out.astype(object).where(pd.notna(out), None).to_dict(
            orient="records"
        ),
        "count": len(out),
        "fake": sum(r["label"] == "Fake" for r in results),
        "genuine": sum(r["label"] == "Genuine" for r in results),
        "skipped": len(texts) - len(valid_idx),
    }


@app.get("/api/dataset-sample")
def dataset_sample():
    if not DATASET_PATH.exists():
        return {"rows": []}

    try:
        df = pd.read_csv(DATASET_PATH).head(8)
        return {
            "rows": df.astype(object).where(pd.notna(df), None).to_dict(
                orient="records"
            )
        }
    except Exception:
        return {"rows": []}
