
from pathlib import Path

import joblib
import pandas as pd
import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sklearn.datasets import load_breast_cancer


# =========================================================
# 1. DUONG DAN DU AN
# =========================================================
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
MODEL_PATH = BASE_DIR / "model_final" / "svm_rbf_final.joblib"
RESULT_PATH = (
    BASE_DIR / "results" / "model_comparison_nested_cv_summary.csv"
)


# =========================================================
# 2. KHOI TAO API VA DOC MO HINH
# =========================================================
app = FastAPI(
    title="BreastCare AI API",
    description=(
        "API du doan va danh gia mo hinh ung thu vu Wisconsin"
    ),
    version="1.1.0",
)

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Khong tim thay mo hinh: {MODEL_PATH}"
    )

artifact = joblib.load(MODEL_PATH)

if not isinstance(artifact, dict) or "model" not in artifact:
    raise ValueError(
        "File mo hinh khong co cau truc dict chua khoa 'model'."
    )

model = artifact["model"]
THRESHOLD = float(artifact.get("threshold", 0.5))
FEATURE_NAMES = list(artifact.get("feature_names", []))

if len(FEATURE_NAMES) != 30:
    raise ValueError(
        f"Can 30 dac trung dau vao, "
        f"nhung tim thay {len(FEATURE_NAMES)}."
    )

# Tai bo du lieu Breast Cancer Wisconsin.
dataset = load_breast_cancer()

# Tao DataFrame theo dung thu tu dac trung cua artifact.
DATA = pd.DataFrame(
    dataset.data,
    columns=dataset.feature_names,
)
DATA = DATA[FEATURE_NAMES]

TOTAL_SAMPLES = len(DATA)

MALIGNANT_LABEL = "malignant"
BENIGN_LABEL = "benign"


# =========================================================
# 3. PHUC VU GIAO DIEN HTML/CSS/JAVASCRIPT
# =========================================================
if not FRONTEND_DIR.exists():
    raise FileNotFoundError(
        f"Khong tim thay thu muc: {FRONTEND_DIR}"
    )

app.mount(
    "/static",
    StaticFiles(directory=str(FRONTEND_DIR)),
    name="static",
)


@app.get("/", include_in_schema=False)
def home():
    index_file = FRONTEND_DIR / "index.html"

    if not index_file.exists():
        raise HTTPException(
            status_code=404,
            detail="Khong tim thay index.html",
        )

    return FileResponse(index_file)


# =========================================================
# 4. SCHEMA DU LIEU DAU VAO
# =========================================================
class PredictionInput(BaseModel):
    features: dict[str, float] = Field(
        ...,
        description=(
            "Gia tri cua 30 dac trung trong bo du lieu Wisconsin"
        ),
    )


# =========================================================
# 5. KIEM TRA API
# =========================================================
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model": "SVM RBF",
        "features": len(FEATURE_NAMES),
        "threshold": THRESHOLD,
        "total_samples": TOTAL_SAMPLES,
    }


# =========================================================
# 6. TONG QUAN DU LIEU
# =========================================================
@app.get("/api/overview")
def overview():
    target = dataset.target

    malignant_count = int(np.sum(target == 0))
    benign_count = int(np.sum(target == 1))

    return {
        "total_samples": int(TOTAL_SAMPLES),
        "total_features": len(FEATURE_NAMES),
        "malignant_count": malignant_count,
        "benign_count": benign_count,
        "class_names": ["Malignant", "Benign"],
        "class_counts": [
            malignant_count,
            benign_count,
        ],
    }


# =========================================================
# 7. LAY MAU THAM KHAO THEO SO THU TU
# =========================================================
@app.get("/api/sample")
def sample(index: int = 0):
    """
    Lay mot mau tu bo du lieu Wisconsin.

    index bat dau tu 0:
        index=0   -> mau thu 1
        index=1   -> mau thu 2
        index=568 -> mau thu 569
    """

    if index < 0 or index >= TOTAL_SAMPLES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Chi so mau phai nam trong khoang "
                f"0 den {TOTAL_SAMPLES - 1}."
            ),
        )

    row = DATA.iloc[index].to_dict()

    # Dataset sklearn quy uoc:
    # target 0 = malignant, target 1 = benign.
    true_diagnosis = str(
        dataset.target_names[int(dataset.target[index])]
    )

    return {
        "sample_index": index + 1,
        "total_samples": TOTAL_SAMPLES,
        "true_diagnosis": true_diagnosis,
        "features": {
            name: float(value)
            for name, value in row.items()
        },
    }


# =========================================================
# 8. DU DOAN BANG SVM RBF
# =========================================================
@app.post("/api/predict")
def predict(payload: PredictionInput):
    supplied = payload.features

    # Kiem tra thieu hoac thua dac trung.
    missing = [
        name for name in FEATURE_NAMES
        if name not in supplied
    ]

    extra = [
        name for name in supplied
        if name not in FEATURE_NAMES
    ]

    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Thieu dac trung dau vao.",
                "missing_features": missing,
            },
        )

    if extra:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Co dac trung khong hop le.",
                "extra_features": extra,
            },
        )

    try:
        values = [
            float(supplied[name])
            for name in FEATURE_NAMES
        ]
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422,
            detail="Tat ca gia tri dau vao phai la so.",
        )

    if not np.all(np.isfinite(values)):
        raise HTTPException(
            status_code=422,
            detail="Gia tri dau vao phai la so huu han.",
        )

    input_df = pd.DataFrame(
        [values],
        columns=FEATURE_NAMES,
    )

    try:
        # Lay xac suat tu mo hinh.
        probabilities = model.predict_proba(input_df)[0]

        # Lay lop tu buoc mo hinh trong Pipeline.
        classifier = model.named_steps["model"]
        classes = list(classifier.classes_)

        # Tim dung vi tri lop malignant.
        if MALIGNANT_LABEL in classes:
            malignant_index = classes.index(MALIGNANT_LABEL)
        elif 0 in classes:
            # Neu mo hinh dung nhan so:
            # 0 = malignant, 1 = benign.
            malignant_index = classes.index(0)
        else:
            raise ValueError(
                "Khong tim thay lop malignant trong mo hinh."
            )

        malignant_probability = float(
            probabilities[malignant_index]
        )

        benign_probability = 1.0 - malignant_probability

        predicted_label = (
            MALIGNANT_LABEL
            if malignant_probability >= THRESHOLD
            else BENIGN_LABEL
        )

        return {
            "prediction": predicted_label,
            "prediction_vi": (
                "Nghi ngờ ác tính"
                if predicted_label == MALIGNANT_LABEL
                else "Nghi ngờ lành tính"
            ),
            "malignant_probability": malignant_probability,
            "benign_probability": benign_probability,
            "threshold": THRESHOLD,
            "model": "SVM RBF",
            "note": (
                "Ket qua chi phuc vu hoc tap va nghien cuu, "
                "khong thay the ket luan chan doan cua bac si."
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Loi khi du doan: {str(exc)}",
        )


# =========================================================
# 9. KET QUA NESTED CROSS-VALIDATION
# =========================================================
@app.get("/api/evaluation")
def evaluation():
    if not RESULT_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Khong tim thay file ket qua: {RESULT_PATH}"
            ),
        )

    df = pd.read_csv(RESULT_PATH)

    required_columns = [
        "Model",
        "AUC_Mean",
        "Accuracy_Mean",
        "Sensitivity_Mean",
        "Specificity_Mean",
        "F1_Mean",
        "Outer_Folds",
    ]

    missing_columns = [
        col for col in required_columns
        if col not in df.columns
    ]

    if missing_columns:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "File CSV thieu cot can thiet.",
                "missing_columns": missing_columns,
            },
        )

    df = df[required_columns].copy()
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.astype(object).where(pd.notna(df), None)

    return {
        "source": (
            "results/model_comparison_nested_cv_summary.csv"
        ),
        "models": df.to_dict(orient="records"),
        "columns": required_columns,
    }
