from pathlib import Path
import unittest

from benchmarks.loaders import load_benchmark_suite


class BenchmarkLoaderTests(unittest.TestCase):
    def test_smoke_fixture_parses_all_modes_and_resolves_paths(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "benchmarks" / "fixtures" / "smoke_cases.json"
        suite = load_benchmark_suite(fixture_path)

        self.assertEqual(suite.schema_version, 1)
        self.assertEqual(len(suite.cases), 6)
        self.assertEqual(
            {case.mode for case in suite.cases},
            {"text_single", "text_multi", "rewriting_pair", "image", "model_3d"},
        )

        image_case = next(case for case in suite.cases if case.case_id == "smoke_image")
        model_case = next(case for case in suite.cases if case.case_id == "smoke_model")
        self.assertIsNotNone(image_case.input_path)
        self.assertIsNotNone(model_case.input_path)
        self.assertTrue(image_case.input_path.exists())
        self.assertTrue(model_case.input_path.exists())

    def test_incomplete_case_is_marked_without_failing_load(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "benchmarks" / "fixtures" / "smoke_cases.json"
        suite = load_benchmark_suite(fixture_path)

        incomplete_case = next(
            case for case in suite.cases if case.case_id == "smoke_incomplete_scaffold"
        )
        self.assertTrue(incomplete_case.is_incomplete)
        self.assertIn("missing_ground_truth", incomplete_case.incomplete_reason or "")

    def test_rewriting_pair_uses_q2_as_input_used(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "benchmarks" / "fixtures" / "smoke_cases.json"
        suite = load_benchmark_suite(fixture_path)

        rewriting_case = next(case for case in suite.cases if case.mode == "rewriting_pair")
        self.assertEqual(rewriting_case.input_used(), rewriting_case.q2)


if __name__ == "__main__":
    unittest.main()
