import unittest

from benchmarks.metrics import (
    hit_at_k,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank,
    score_ranking,
    selected_artifact_hit,
)


class MetricsTests(unittest.TestCase):
    def test_recall_at_k_uses_true_recall_fraction(self) -> None:
        ranking = ["a", "b", "c", "d"]
        self.assertEqual(recall_at_k(ranking, ["c", "d"], 1), 0.0)
        self.assertEqual(recall_at_k(ranking, ["c", "d"], 3), 0.5)
        self.assertEqual(recall_at_k(ranking, ["c", "d"], 5), 1.0)

    def test_hit_at_k_is_binary(self) -> None:
        ranking = ["a", "b", "c", "d"]
        self.assertEqual(hit_at_k(ranking, ["c", "d"], 1), 0.0)
        self.assertEqual(hit_at_k(ranking, ["c", "d"], 3), 1.0)

    def test_precision_at_k_uses_top_k_denominator(self) -> None:
        ranking = ["a", "b", "c", "d", "e"]
        self.assertEqual(precision_at_k(ranking, ["b", "d"], 5), 0.4)

    def test_reciprocal_rank_returns_first_hit_position(self) -> None:
        ranking = ["x", "y", "z"]
        self.assertAlmostEqual(reciprocal_rank(ranking, ["z"]), 1.0 / 3.0)
        self.assertEqual(reciprocal_rank(ranking, ["missing"]), 0.0)

    def test_ndcg_at_k_for_binary_multi_relevant(self) -> None:
        ranking = ["a", "c", "b", "d"]
        score = ndcg_at_k(ranking, ["a", "b"], 5)
        self.assertIsNotNone(score)
        self.assertGreater(score or 0.0, 0.9)

    def test_score_ranking_for_single_target_family(self) -> None:
        ranking = ["artifact_2", "artifact_3", "artifact_1"]
        scores = score_ranking(
            ranking,
            relevant_artifacts=["artifact_1"],
            mode="text_single",
        )
        self.assertEqual(scores["recall_at_1"], 0.0)
        self.assertEqual(scores["recall_at_5"], 1.0)
        self.assertIsNone(scores["hit_at_5"])
        self.assertIsNone(scores["precision_at_5"])
        self.assertAlmostEqual(scores["mrr"] or 0.0, 1.0 / 3.0)
        self.assertIsNone(scores["ndcg_at_5"])

    def test_score_ranking_for_text_multi(self) -> None:
        ranking = ["artifact_2", "artifact_3", "artifact_1", "artifact_4", "artifact_5"]
        scores = score_ranking(
            ranking,
            relevant_artifacts=["artifact_1", "artifact_3", "artifact_9"],
            mode="text_multi",
        )
        self.assertIsNone(scores["recall_at_1"])
        self.assertIsNone(scores["recall_at_5"])
        self.assertEqual(scores["hit_at_5"], 1.0)
        self.assertEqual(scores["precision_at_5"], 0.4)
        self.assertIsNone(scores["mrr"])
        self.assertIsNotNone(scores["ndcg_at_5"])

    def test_empty_relevant_set_returns_none_metrics(self) -> None:
        ranking = ["artifact_1"]
        scores = score_ranking(ranking, relevant_artifacts=[], mode="text_multi")
        self.assertIsNone(scores["recall_at_1"])
        self.assertIsNone(scores["recall_at_5"])
        self.assertIsNone(scores["hit_at_5"])
        self.assertIsNone(scores["precision_at_5"])
        self.assertIsNone(scores["mrr"])
        self.assertIsNone(scores["ndcg_at_5"])

    def test_selected_artifact_hit_scores_binary_match(self) -> None:
        self.assertEqual(selected_artifact_hit("artifact_7", ["artifact_7", "artifact_8"]), 1.0)
        self.assertEqual(selected_artifact_hit("artifact_9", ["artifact_7", "artifact_8"]), 0.0)

    def test_selected_artifact_hit_returns_none_without_selection_or_targets(self) -> None:
        self.assertIsNone(selected_artifact_hit(None, ["artifact_7"]))
        self.assertIsNone(selected_artifact_hit("artifact_7", []))


if __name__ == "__main__":
    unittest.main()
