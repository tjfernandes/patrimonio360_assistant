import unittest
from types import SimpleNamespace

from app.services.opensearch_client import OpenSearchGateway


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        LOG_JSON=False,
        LOG_JSON_PRETTY=False,
        LOG_JSON_INDENT=2,
        CHAT_IN_TOUR_BOOST=1.75,
        CHAT_RETRIEVAL_EMBEDDING_ONLY=False,
        OPENSEARCH_INDEX_ARTIFACT="cultural_heritage_artifacts",
        OPENSEARCH_INDEX_IMAGE="cultural_heritage_images",
    )


class _DummyClient:
    def __init__(self) -> None:
        self.last_search: dict[str, object] | None = None

    def search(self, *, index: str, body: dict[str, object]) -> dict[str, object]:
        self.last_search = {"index": index, "body": body}
        return {"hits": {"hits": [], "total": {"value": 0}}, "took": 1, "timed_out": False}


class OpenSearchFieldMappingTests(unittest.TestCase):
    def test_lexical_multi_match_uses_text_subfields(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="azulejos religiosos",
            lexical_query="azulejos religiosos",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )
        queries = body["query"]["hybrid"]["queries"]
        multi_match = next(
            q["bool"]["must"][0]["multi_match"]
            for q in queries
            if "bool" in q and "multi_match" in q["bool"]["must"][0]
        )
        fields = multi_match["fields"]
        self.assertIn("search_text^4", fields)
        self.assertIn("inventory_number^1.8", fields)
        self.assertIn("inventory_number.text^1.8", fields)
        self.assertIn("category.text^1.5", fields)
        self.assertIn("support_or_material.text^1.2", fields)
        self.assertIn("technique.text^1.2", fields)
        self.assertIn("origin_history^1.1", fields)
        self.assertIn("production_center.text^1.1", fields)
        self.assertIn("incorporation.text^1.1", fields)

    def test_image_search_uses_visual_embedding_knn_with_in_tour_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()
        gateway._client = dummy

        gateway._search_similar_images_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embedding=[0.1, 0.2, 0.3],
            top_k=3,
        )

        assert dummy.last_search is not None
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        bool_query = body["query"]["bool"]
        self.assertEqual(
            bool_query["should"],
            [{"term": {"in_tour": {"value": True, "boost": 1.75}}}],
        )
        self.assertEqual(len(bool_query["must"]), 1)
        knn_query = bool_query["must"][0]["knn"]
        self.assertIn("visual_embedding", knn_query)

    def test_multiview_search_keeps_knn_required_with_in_tour_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()
        gateway._client = dummy

        gateway._search_similar_images_multi_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embeddings=[[0.1, 0.2], [0.3, 0.4]],
            top_k=4,
        )

        assert dummy.last_search is not None
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        bool_query = body["query"]["bool"]
        self.assertEqual(
            bool_query["should"],
            [{"term": {"in_tour": {"value": True, "boost": 1.75}}}],
        )
        self.assertEqual(len(bool_query["must"]), 1)
        nested_bool = bool_query["must"][0]["bool"]
        self.assertEqual(nested_bool["minimum_should_match"], 1)
        self.assertEqual(len(nested_bool["should"]), 2)
        first_knn = nested_bool["should"][0]["knn"]
        self.assertIn("visual_embedding", first_knn)

    def test_artifact_fetch_by_inventory_requires_museum_id_filter(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()
        gateway._client = dummy

        skipped = gateway._fetch_artifacts_by_inventory_numbers_sync(
            museum_slug="mnt",
            museum_id=None,
            inventory_numbers=["967"],
            top_k=1,
        )
        self.assertEqual(skipped, [])
        self.assertIsNone(dummy.last_search)

        gateway._fetch_artifacts_by_inventory_numbers_sync(
            museum_slug="mnt",
            museum_id="8",
            inventory_numbers=["967"],
            top_k=1,
        )

        assert dummy.last_search is not None
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        bool_query = body["query"]["bool"]
        self.assertEqual(bool_query["filter"], [{"term": {"museum_id": "8"}}])
        should = bool_query["should"]
        self.assertIn({"terms": {"inventory_number": ["967"]}}, should)


if __name__ == "__main__":
    unittest.main()
