"""
Script to generate 30,000 synthetic patient records and train MediTriage AI models.
"""
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.ml.synthetic_data import generate_and_save_dataset_30k
from app.ml.train import train_pipeline

def main():
    csv_path = os.path.join(os.path.dirname(__file__), "..", "app", "ml", "data", "synthetic_patients_30k.csv")
    csv_path = os.path.abspath(csv_path)
    print(f"Step 1: Generating 30,000 synthetic patient records to {csv_path}...")
    t0 = time.time()
    df = generate_and_save_dataset_30k(csv_path, random_seed=42)
    t1 = time.time()
    n_emerg = int(df["is_emergency"].sum())
    emerg_pct = (n_emerg / len(df)) * 100
    print(f"Generated {len(df)} records in {t1 - t0:.2f}s.")
    print(f"Emergency prevalence: {n_emerg}/{len(df)} ({emerg_pct:.2f}%)")
    print(f"Columns: {list(df.columns)}")
    print(f"Sample medication: {df['medications'].iloc[0]}")

    print("\nStep 2: Training ML pipeline on 30k dataset...")
    artifacts_dir = os.path.join(os.path.dirname(__file__), "..", "app", "ml", "artifacts", "v1")
    artifacts_dir = os.path.abspath(artifacts_dir)
    results = train_pipeline(
        data_path=csv_path,
        output_dir=artifacts_dir,
        use_xgboost=True,
        random_seed=42,
    )
    t2 = time.time()
    print(f"Training completed in {t2 - t1:.2f}s.")
    eval_metrics = results.get("evaluation_metrics", {})
    triage_test = eval_metrics.get("triage", {})
    cost_info = triage_test.get("asymmetric_clinical_cost", {})
    print(f"Test Accuracy: {triage_test.get('accuracy')}")
    print(f"Test Emergency Recall: {triage_test.get('emergency_recall_sensitivity')}")
    print(f"Test Emergency False Negatives: {triage_test.get('emergency_false_negatives')}")
    print(f"Asymmetric Clinical Cost: {cost_info}")
    print(f"Artifacts saved to {artifacts_dir}")

if __name__ == "__main__":
    main()
