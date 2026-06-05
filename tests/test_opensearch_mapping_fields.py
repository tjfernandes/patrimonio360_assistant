import unittest
from types import SimpleNamespace
import sys
import types

if "pydantic_settings" not in sys.modules:
    pydantic_settings_stub = types.ModuleType("pydantic_settings")

    class _BaseSettings:
        def __init__(self, **_: object) -> None:
            pass

    class _SettingsConfigDict(dict):
        pass

    pydantic_settings_stub.BaseSettings = _BaseSettings
    pydantic_settings_stub.SettingsConfigDict = _SettingsConfigDict
    sys.modules["pydantic_settings"] = pydantic_settings_stub

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
        OPENSEARCH_INDEX_AUTOR="cultural_heritage_authors",
        OPENSEARCH_INDEX_CONJUNTO="cultural_heritage_sets",
        OPENSEARCH_INDEX_EXPOSICAO="cultural_heritage_exhibitions",
    )


class _DummyClient:
    def __init__(self) -> None:
        self.last_search: dict[str, object] | None = None

    def search(self, *, index: str, body: dict[str, object]) -> dict[str, object]:
        self.last_search = {"index": index, "body": body}
        return {"hits": {"hits": [], "total": {"value": 0}}, "took": 1, "timed_out": False}


class _SearchDummyClient:
    def __init__(self) -> None:
        self.last_kwargs: dict[str, object] | None = None

    def search(self, **kwargs: object) -> dict[str, object]:
        self.last_kwargs = dict(kwargs)
        return {
            "hits": {
                "hits": [
                    {
                        "_score": 4.2,
                        "_source": {
                            "artifact_id": "artifact_out_1",
                            "inventory_number": "100",
                            "title": "Vestido Fora do Percurso",
                            "museum_id": "museum_1",
                            "category": "Vestuário",
                            "description": "Vestido de criança.",
                            "search_text": "vestido crianca",
                            "image_id": "img_out_1",
                            "artifact_title": "Vestido Fora do Percurso",
                            "caption": "caption out",
                            "alt_text": "alt out",
                            "in_tour": False,
                        },
                    },
                    {
                        "_score": 3.1,
                        "_source": {
                            "artifact_id": "artifact_in_1",
                            "inventory_number": "101",
                            "title": "Vestido em Percurso",
                            "museum_id": "museum_1",
                            "category": "Vestuário",
                            "description": "Vestido de criança no percurso.",
                            "search_text": "vestido crianca percurso",
                            "image_id": "img_in_1",
                            "artifact_title": "Vestido em Percurso",
                            "caption": "caption in",
                            "alt_text": "alt in",
                            "in_tour": True,
                        },
                    },
                ],
                "total": {"value": 2},
            },
            "took": 2,
            "timed_out": False,
        }


class _PagedSearchDummyClient:
    def __init__(self) -> None:
        self.last_kwargs: dict[str, object] | None = None

    def search(self, **kwargs: object) -> dict[str, object]:
        self.last_kwargs = dict(kwargs)
        return {
            "hits": {
                "hits": [
                    {
                        "_score": 2.4,
                        "_source": {
                            "artifact_id": "artifact_page_1",
                            "inventory_number": "200",
                            "title": "Resultado Paginado",
                            "museum_id": "museum_1",
                            "category": "VestuÃ¡rio",
                            "description": "Resultado vindo da pagina OpenSearch.",
                            "search_text": "resultado paginado",
                            "image_id": "img_page_1",
                            "artifact_title": "Resultado Paginado",
                            "caption": "caption page",
                            "alt_text": "alt page",
                            "in_tour": True,
                        },
                    }
                ],
                "total": {"value": 23},
            },
            "took": 3,
            "timed_out": False,
        }


class _ImageFetchDummyClient:
    def __init__(self) -> None:
        self.last_kwargs: dict[str, object] | None = None

    def search(self, **kwargs: object) -> dict[str, object]:
        self.last_kwargs = dict(kwargs)
        return {
            "hits": {
                "hits": [
                    {
                        "_score": 1.0,
                        "_source": {
                            "artifact_id": "artifact_1",
                            "image_id": "image_1",
                            "museum_id": "museum_1",
                            "local_path": "Images/artifact_1/image_1.jpg",
                            "source_url": None,
                            "artifact_title": "Artifact 1",
                            "inventory_number": "I1",
                            "caption": "caption",
                            "alt_text": "alt",
                            "in_tour": True,
                        },
                    }
                ],
                "total": {"value": 3},
            },
            "took": 3,
            "timed_out": False,
        }


class _ImageFetchOutOfOrderDummyClient:
    def __init__(self) -> None:
        self.last_kwargs: dict[str, object] | None = None

    def search(self, **kwargs: object) -> dict[str, object]:
        self.last_kwargs = dict(kwargs)
        return {
            "hits": {
                "hits": [
                    {
                        "_score": 1.0,
                        "_source": {
                            "artifact_id": "artifact_1",
                            "image_id": "image_3",
                            "image_order": 3,
                            "museum_id": "museum_1",
                            "local_path": "Images/artifact_1/image_3.jpg",
                        },
                    },
                    {
                        "_score": 1.0,
                        "_source": {
                            "artifact_id": "artifact_1",
                            "image_id": "image_1",
                            "image_order": 1,
                            "museum_id": "museum_1",
                            "local_path": "Images/artifact_1/image_1.jpg",
                        },
                    },
                    {
                        "_score": 1.0,
                        "_source": {
                            "artifact_id": "artifact_1",
                            "image_id": "image_missing",
                            "museum_id": "museum_1",
                            "local_path": "Images/artifact_1/image_missing.jpg",
                        },
                    },
                    {
                        "_score": 1.0,
                        "_source": {
                            "artifact_id": "artifact_1",
                            "image_id": "image_2",
                            "image_order": 2,
                            "museum_id": "museum_1",
                            "local_path": "Images/artifact_1/image_2.jpg",
                        },
                    },
                ],
                "total": {"value": 4},
            },
            "took": 3,
            "timed_out": False,
        }


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

    def test_author_name_fetch_uses_authors_index(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()
        gateway._client = dummy

        gateway._fetch_authors_by_names_sync(
            names=["Fernando Pessoa"],
            top_k=3,
        )

        assert dummy.last_search is not None
        self.assertEqual(dummy.last_search["index"], "cultural_heritage_authors")
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["size"], 3)
        self.assertIn("biografia", body["_source"])
        self.assertIn("biography", body["_source"])
        bool_query = body["query"]["bool"]
        self.assertEqual(bool_query["minimum_should_match"], 1)
        self.assertTrue(
            any("match_phrase" in clause and "name" in clause["match_phrase"] for clause in bool_query["should"])
        )

    def test_text_retrieval_prioritizes_in_tour_results(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _SearchDummyClient()
        gateway._client = dummy

        results = gateway._search_relevant_context_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="vestidos crianca",
            lexical_query="vestidos crianca",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=2,
            filters=None,
            sort=None,
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["artifact_id"], "artifact_in_1")
        self.assertIs(results[0]["in_tour"], True)
        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertGreaterEqual(body["size"], 2)
        self.assertIn("in_tour", body["_source"])

    def test_text_retrieval_page_uses_opensearch_from_size_and_total(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        page = gateway._search_relevant_context_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="vestidos crianca",
            lexical_query="vestidos crianca",
            query_embedding=[0.1, 0.2, 0.3],
            from_offset=10,
            page_size=5,
            filters=None,
            sort=None,
        )

        self.assertEqual(page.total, 23)
        self.assertEqual(page.results[0]["artifact_id"], "artifact_page_1")
        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["from"], 10)
        self.assertEqual(body["size"], 5)
        self.assertTrue(body["track_total_hits"])
        self.assertEqual(body["query"]["hybrid"]["pagination_depth"], 15)
        self.assertEqual(dummy.last_kwargs["search_pipeline"], "nlp-search-pipeline")
        queries = body["query"]["hybrid"]["queries"]
        knn_query = next(
            q["bool"]["must"][0]["knn"]
            for q in queries
            if "bool" in q and "knn" in q["bool"]["must"][0]
        )
        self.assertGreaterEqual(knn_query["text_embedding"]["k"], 15)

    def test_text_retrieval_page_uses_fixed_retrieval_window(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        gateway._search_relevant_context_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="vestidos crianca",
            lexical_query="vestidos crianca",
            query_embedding=[0.1, 0.2, 0.3],
            from_offset=15,
            page_size=15,
            filters=None,
            sort=None,
            retrieval_window_size=150,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["query"]["hybrid"]["pagination_depth"], 150)
        queries = body["query"]["hybrid"]["queries"]
        knn_query = next(
            q["bool"]["must"][0]["knn"]
            for q in queries
            if "bool" in q and "knn" in q["bool"]["must"][0]
        )
        self.assertEqual(knn_query["text_embedding"]["k"], 150)

    def test_image_retrieval_prioritizes_in_tour_results(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _SearchDummyClient()
        gateway._client = dummy

        results = gateway._search_similar_images_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embedding=[0.1, 0.2, 0.3],
            top_k=2,
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["artifact_id"], "artifact_in_1")
        self.assertIs(results[0]["in_tour"], True)
        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertGreaterEqual(body["size"], 2)
        self.assertIn("in_tour", body["_source"])

    def test_image_fetch_by_artifact_collapses_one_image_per_artifact(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _ImageFetchDummyClient()
        gateway._client = dummy

        gateway._fetch_images_by_artifact_ids_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            artifact_ids=["artifact_1", "artifact_2", "artifact_3"],
            per_artifact=1,
            max_total=3,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["size"], 3)
        self.assertEqual(body["collapse"], {"field": "artifact_id"})
        self.assertIn("image_order", body["_source"])
        self.assertEqual(
            body["sort"],
            [
                {
                    "image_order": {
                        "order": "asc",
                        "missing": "_last",
                        "unmapped_type": "long",
                    }
                }
            ],
        )

    def test_image_fetch_by_artifact_orders_images_by_image_order(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _ImageFetchOutOfOrderDummyClient()
        gateway._client = dummy

        results = gateway._fetch_images_by_artifact_ids_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            artifact_ids=["artifact_1"],
            per_artifact=4,
            max_total=4,
        )

        self.assertEqual(
            [result["image_id"] for result in results],
            ["image_1", "image_2", "image_3", "image_missing"],
        )
        self.assertEqual([result.get("image_order") for result in results[:3]], [1, 2, 3])

    def test_image_retrieval_page_uses_opensearch_from_size_and_total(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        page = gateway._search_similar_images_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embedding=[0.1, 0.2, 0.3],
            from_offset=6,
            page_size=4,
        )

        self.assertEqual(page.total, 23)
        self.assertEqual(page.results[0]["artifact_id"], "artifact_page_1")
        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["from"], 6)
        self.assertEqual(body["size"], 4)
        self.assertTrue(body["track_total_hits"])
        knn_query = body["query"]["bool"]["must"][0]["knn"]
        self.assertGreaterEqual(knn_query["visual_embedding"]["k"], 10)

    def test_image_retrieval_page_uses_fixed_retrieval_window(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        gateway._search_similar_images_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embedding=[0.1, 0.2, 0.3],
            from_offset=15,
            page_size=15,
            retrieval_window_size=150,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        knn_query = body["query"]["bool"]["must"][0]["knn"]
        self.assertEqual(knn_query["visual_embedding"]["k"], 150)

    def test_multiview_retrieval_page_uses_fixed_retrieval_window(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        gateway._search_similar_images_multi_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embeddings=[[0.1, 0.2, 0.3], [0.2, 0.3, 0.4]],
            from_offset=15,
            page_size=15,
            retrieval_window_size=150,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        nested_bool = body["query"]["bool"]["must"][0]["bool"]
        first_knn = nested_bool["should"][0]["knn"]
        self.assertEqual(first_knn["visual_embedding"]["k"], 150)

    def test_multiview_retrieval_prioritizes_in_tour_results(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _SearchDummyClient()
        gateway._client = dummy

        results = gateway._search_similar_images_multi_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            image_embeddings=[[0.1, 0.2, 0.3], [0.2, 0.3, 0.4]],
            top_k=2,
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["artifact_id"], "artifact_in_1")
        self.assertIs(results[0]["in_tour"], True)
        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        self.assertGreaterEqual(body["size"], 2)
        self.assertIn("in_tour", body["_source"])


if __name__ == "__main__":
    unittest.main()
