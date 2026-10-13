"""
MediTriage AI — Preprocessing and Feature Engineering Pipeline
Handles numeric vitals, missing value indicators, categorical encodings,
and multi-lingual complaint text representations without data leakage.
"""

from typing import List, Tuple, Optional
import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer

from app.ml.schema import (
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_FEATURE_COLUMNS,
    sanitize_features,
)


class TextColumnExtractor(BaseEstimator, TransformerMixin):
    """Safely extracts a single text column as a 1D iterable of strings."""
    def __init__(self, column_name: str):
        self.column_name = column_name

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            if self.column_name in X.columns:
                series = X[self.column_name].fillna("").astype(str)
            else:
                series = pd.Series([""] * len(X))
        else:
            series = pd.Series([""] * len(X))
        return series.tolist()


def build_preprocessor() -> ColumnTransformer:
    """
    Constructs a ColumnTransformer that operates cleanly on raw input DataFrames.
    - Numeric features: Imputed with median and missing-indicator + scaled.
    - Categorical features: Imputed + OneHotEncoded.
    - Text complaint: TF-IDF vectorization with n-grams.
    - Known conditions: CountVectorizer boolean indicator.
    """
    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scaler", StandardScaler()),
    ])

    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="missing")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    complaint_pipe = Pipeline([
        ("extractor", TextColumnExtractor("chief_complaint")),
        ("tfidf", TfidfVectorizer(max_features=80, ngram_range=(1, 2), token_pattern=r"(?u)\S+")),
    ])

    conditions_pipe = Pipeline([
        ("extractor", TextColumnExtractor("known_conditions_text")),
        ("count", CountVectorizer(max_features=25, binary=True)),
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, NUMERICAL_FEATURE_COLUMNS),
            ("cat", categorical_pipe, CATEGORICAL_FEATURE_COLUMNS),
            ("complaint", complaint_pipe, ["chief_complaint"]),
            ("conditions", conditions_pipe, ["known_conditions_text"]),
        ],
        remainder="drop",
        sparse_threshold=0,
        verbose_feature_names_out=True,
    )


    return preprocessor


def prepare_features_and_targets(
    df: pd.DataFrame,
    target_col: str = "triage_level",
) -> Tuple[pd.DataFrame, Optional[pd.Series]]:
    """
    Sanitizes features to prevent leakage and extracts features and target series.
    """
    # 1. Clean feature frame by removing forbidden columns
    allowed_cols = sanitize_features(list(df.columns))
    feature_cols = [c for c in allowed_cols if c != target_col and c != "department" and c != "is_emergency"]

    # 2. Derive helper columns if missing (e.g. temperature_f from temperature and temperature_unit)
    clean_df = df.copy()
    if "temperature_f" not in clean_df.columns and "temperature" in clean_df.columns:
        if "temperature_unit" in clean_df.columns:
            is_celsius = clean_df["temperature_unit"].fillna("F").astype(str).str.upper() == "C"
        else:
            is_celsius = False
        clean_df["temperature_f"] = np.where(
            is_celsius,
            (clean_df["temperature"] * 9.0 / 5.0) + 32.0,
            clean_df["temperature"],
        )
    if "known_conditions_text" not in clean_df.columns and "known_conditions" in clean_df.columns:
        clean_df["known_conditions_text"] = clean_df["known_conditions"].apply(
            lambda x: ", ".join(x) if isinstance(x, list) else str(x or "")
        )

    # Fill any missing required feature columns with defaults so transformer doesn't error
    for col in NUMERICAL_FEATURE_COLUMNS:
        if col not in clean_df.columns:
            clean_df[col] = np.nan
    for col in CATEGORICAL_FEATURE_COLUMNS:
        if col not in clean_df.columns:
            clean_df[col] = "missing"
    if "chief_complaint" not in clean_df.columns:
        clean_df["chief_complaint"] = ""
    if "known_conditions_text" not in clean_df.columns:
        clean_df["known_conditions_text"] = ""

    X = clean_df[NUMERICAL_FEATURE_COLUMNS + CATEGORICAL_FEATURE_COLUMNS + ["chief_complaint", "known_conditions_text"]]
    y = clean_df[target_col] if target_col in clean_df.columns else None

    return X, y
