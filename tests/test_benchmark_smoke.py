import asyncio
from pathlib import Path
import tempfile
import unittest

from benchmarks.loaders import load_benchmark_suite
from benchmarks.metrics import score_ranking, selected_artifact_hit
from benchmarks.report import (
    build_markdown_report,
    build_summary,
    write_markdown_report,
    write_results_csv,
    write_results_json,
    write_summary_csv,
    write_summary_json,
)
from benchmarks.runner import run_benchmark_suite
from benchmarks.variants import resolve_variants


class _FakeExecutor:
    def __init__(self, variant_name: str) -> None:
        self.variant_name = variant_name

    async def execute_case(self, case) -> dict[str, object]:
        if case.mode == "rewriting_pair" and self.variant_name == "no_rewriting":
            ranking = ["artifact_miss", case.target_artifact]
        elif case.relevant_artifacts:
            ranking = [case.relevant_artifacts[-1], "artifact_other", case.relevant_artifacts[0]]
        else:
            ranking = [case.target_artifact, "artifact_other"]

        if case.mode == "rewriting_pair" and self.variant_name == "no_rewriting":
            selected_artifact_id = "artifact_miss"
        elif case.relevant_artifacts:
            selected_artifact_id = case.relevant_artifacts[0]
        else:
            selected_artifact_id = case.target_artifact

        metrics = score_ranking(
            ranking,
            relevant_artifacts=case.scoring_targets,
            mode=case.mode,
        )
        return {
            "case_id": case.case_id,
            "museum_id": case.museum_id,
            "mode": case.mode,
            "variant": self.variant_name,
            "status": "scored",
            "skip_reason": None,
            "error": None,
            "notes": case.notes,
            "query": case.query,
            "q1": case.q1,
            "q2": case.q2,
            "rewritten_query": case.rewritten_query,
            "message": case.message,
            "input_path": str(case.input_path) if case.input_path is not None else None,
            "input_id": case.input_id,
            "input_used": case.input_used(),
            "ranking_artifact_ids": ranking,
            "q1_ranking_artifact_ids": ["artifact_q1_a", "artifact_q1_b"]
            if case.mode == "rewriting_pair"
            else [],
            "retrieval_top_1_artifact_id": ranking[0] if ranking else None,
            "selected_artifact_id": selected_artifact_id,
            "selected_artifact_rank": ranking.index(selected_artifact_id) + 1
            if selected_artifact_id in ranking
            else None,
            "selected_hit": selected_artifact_hit(selected_artifact_id, case.scoring_targets),
            "assistant_selection_error": None,
            "target_artifact": case.target_artifact,
            "relevant_artifacts": list(case.relevant_artifacts),
            "recall_at_1": metrics["recall_at_1"],
            "recall_at_5": metrics["recall_at_5"],
            "hit_at_5": metrics["hit_at_5"],
            "precision_at_5": metrics["precision_at_5"],
            "mrr": metrics["mrr"],
            "ndcg_at_5": metrics["ndcg_at_5"],
            "latency_first_ms": 12.5 if case.mode == "model_3d" else None,
            "latency_final_ms": 34.5,
            "result_count": len(ranking),
        }

    def close(self) -> None:
        return None


class BenchmarkSmokeTests(unittest.TestCase):
    def test_runner_summary_and_report_generation(self) -> None:
        fixture_path = Path(__file__).resolve().parents[1] / "benchmarks" / "fixtures" / "smoke_cases.json"
        suite = load_benchmark_suite(fixture_path)
        variants = resolve_variants(["full", "no_rewriting", "dense_only"])

        results = asyncio.run(
            run_benchmark_suite(
                suite,
                variants=variants,
                executor_factory=lambda variant: _FakeExecutor(variant.name),
            )
        )

        self.assertEqual(len(results), len(suite.cases) * len(variants))
        unsupported = [
            row for row in results if row.get("variant") == "dense_only" and row.get("status") == "skipped"
        ]
        self.assertTrue(unsupported)

        summary = build_summary(results)
        self.assertTrue(summary["overall_counts"])
        self.assertTrue(summary["single_target_family"]["by_mode"])
        self.assertTrue(summary["text_multi"]["overall"])
        self.assertIn("selected_hit", summary["overall_counts"][0])

        run_metadata = {
            "generated_at": "2026-04-15T00:00:00+00:00",
            "cases_path": str(fixture_path),
            "variants": [variant.name for variant in variants],
            "assistant_selection_enabled": True,
        }
        report = build_markdown_report(
            run_metadata=run_metadata,
            summary=summary,
            results=results,
        )
        self.assertIn("Offline Benchmark Report", report)
        self.assertIn("Text Single, Image, 3D", report)
        self.assertIn("Text Multi", report)
        self.assertIn("Hit@5", report)
        self.assertIn("Precision@5", report)
        self.assertIn("Rewriting Delta", report)
        self.assertIn("Avg Final ms", report)
        self.assertIn("unsupported_variant", report)

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            write_results_json(tmp_path / "results.json", run_metadata=run_metadata, results=results)
            write_results_csv(tmp_path / "results.csv", results)
            write_summary_json(tmp_path / "summary.json", summary)
            write_summary_csv(tmp_path / "summary.csv", summary)
            write_markdown_report(tmp_path / "report.md", report)

            for file_name in (
                "results.json",
                "results.csv",
                "summary.json",
                "summary.csv",
                "report.md",
            ):
                self.assertTrue((tmp_path / file_name).exists(), file_name)


if __name__ == "__main__":
    unittest.main()
