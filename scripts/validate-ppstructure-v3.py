import json
import os
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(ROOT / "ocr-models" / "paddlex-cache"))

from paddleocr import PPStructureV3


def serializable_result(result):
    if hasattr(result, "json"):
        value = result.json
        return value() if callable(value) else value
    if hasattr(result, "to_dict"):
        return result.to_dict()
    return str(result)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: validate-ppstructure-v3.py <image> <output-dir>")

    image_path = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    pipeline = PPStructureV3(
        lang="korean",
        ocr_version="PP-OCRv5",
        enable_mkldnn=False,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        use_seal_recognition=False,
        use_table_recognition=True,
        use_formula_recognition=False,
        use_chart_recognition=False,
        use_region_detection=False,
    )
    initialization_seconds = time.perf_counter() - started

    runs = []
    for run_no in range(1, 3):
        started = time.perf_counter()
        results = list(
            pipeline.predict(
                str(image_path),
                use_table_orientation_classify=True,
                use_wired_table_cells_trans_to_html=True,
                use_ocr_results_with_table_cells=True,
            )
        )
        duration_seconds = time.perf_counter() - started
        payload = [serializable_result(result) for result in results]
        output_file = output_dir / f"run-{run_no}.json"
        output_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        runs.append(
            {
                "run": run_no,
                "duration_seconds": round(duration_seconds, 3),
                "result_count": len(results),
                "output_file": str(output_file),
            }
        )

    summary = {
        "image": str(image_path),
        "pipeline": "PPStructureV3",
        "language": "korean",
        "ocr_version": "PP-OCRv5",
        "initialization_seconds": round(initialization_seconds, 3),
        "runs": runs,
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
