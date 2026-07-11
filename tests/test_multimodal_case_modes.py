"""Loader coverage for the Phase 0 multimodal benchmark case modes."""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from benchmarks.loaders import load_benchmark_suite


def _write_suite(cases: list[dict]) -> Path:
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    )
    json.dump({"schema_version": 1, "cases": cases}, handle, ensure_ascii=False)
    handle.close()
    return Path(handle.name)


class MultimodalCaseModesTest(unittest.TestCase):
    def test_text_to_image_case_parses_query_and_excludes(self) -> None:
        path = _write_suite(
            [
                {
                    "case_id": "t2i_1",
                    "museum_id": "mnaz",
                    "mode": "text_to_image",
                    "query": "painel com cabeça de perfil",
                    "target_artifact": "raiz:movel:229739",
                    "exclude_image_ids": ["raiz:image:movel:229739:446051:1", ""],
                }
            ]
        )
        suite = load_benchmark_suite(path)
        case = suite.cases[0]
        self.assertEqual(case.mode, "text_to_image")
        self.assertFalse(case.is_incomplete)
        self.assertEqual(case.input_used(), "painel com cabeça de perfil")
        self.assertEqual(
            case.exclude_image_ids, ["raiz:image:movel:229739:446051:1"]
        )

    def test_text_to_image_without_query_is_incomplete(self) -> None:
        path = _write_suite(
            [
                {
                    "case_id": "t2i_2",
                    "museum_id": "mnaz",
                    "mode": "text_to_image",
                    "target_artifact": "raiz:movel:229739",
                }
            ]
        )
        case = load_benchmark_suite(path).cases[0]
        self.assertTrue(case.is_incomplete)
        self.assertIn("missing_query", case.incomplete_reason or "")

    def test_image_text_requires_both_query_and_image(self) -> None:
        path = _write_suite(
            [
                {
                    "case_id": "it_1",
                    "museum_id": "mnt",
                    "mode": "image_text",
                    "query": "casaco parecido",
                    "target_artifact": "raiz:movel:45712",
                },
                {
                    "case_id": "it_2",
                    "museum_id": "mnt",
                    "mode": "image_text",
                    "image_id": "some_image.jpg",
                    "target_artifact": "raiz:movel:45712",
                },
            ]
        )
        suite = load_benchmark_suite(path)
        missing_image = next(c for c in suite.cases if c.case_id == "it_1")
        missing_query = next(c for c in suite.cases if c.case_id == "it_2")
        self.assertIn("missing_image_input", missing_image.incomplete_reason or "")
        self.assertIn("missing_query", missing_query.incomplete_reason or "")

    def test_unknown_mode_still_rejected(self) -> None:
        path = _write_suite(
            [{"case_id": "bad", "museum_id": "mnt", "mode": "hologram"}]
        )
        with self.assertRaises(ValueError):
            load_benchmark_suite(path)

    def test_to_dict_round_trips_exclude_image_ids(self) -> None:
        path = _write_suite(
            [
                {
                    "case_id": "img_1",
                    "museum_id": "mnt",
                    "mode": "image",
                    "image_id": "artifact_x.jpg",
                    "target_artifact": "raiz:movel:1",
                    "exclude_image_ids": ["raiz:image:movel:1:2:1"],
                }
            ]
        )
        case = load_benchmark_suite(path).cases[0]
        self.assertEqual(
            case.to_dict()["exclude_image_ids"], ["raiz:image:movel:1:2:1"]
        )


if __name__ == "__main__":
    unittest.main()
