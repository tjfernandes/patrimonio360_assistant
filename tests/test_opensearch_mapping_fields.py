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
        CHAT_IN_TOUR_BOOST=1.75,
        IMAGE_IN_TOUR_BOOST=1.75,
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
    def test_artifact_payload_keeps_full_description(self) -> None:
        gateway = OpenSearchGateway(_settings())
        description = "Descricao longa. " * 120

        payload = gateway._artifact_payload_from_source(
            source={
                "artifact_id": "artifact_full_description",
                "description": description,
            },
            score=1.0,
            snippet="Descricao longa.",
        )

        self.assertEqual(payload["description"], description.strip())

    def test_lexical_query_uses_no_stem_precision_fields(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="retrato de senhores",
            lexical_query="retrato de senhores",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )
        queries = body["query"]["hybrid"]["queries"]
        lexical_bool = next(
            q["bool"]["must"][0]["bool"]
            for q in queries
            if "bool" in q and "bool" in q["bool"]["must"][0]
        )
        self.assertEqual(lexical_bool["minimum_should_match"], 1)
        should = lexical_bool["should"]
        self.assertEqual(len(should), 3)

        best_and = should[0]["multi_match"]
        self.assertEqual(best_and["query"], "retrato de senhores")
        self.assertEqual(best_and["fields"], ["title.no_stem^10", "description.no_stem^3"])
        self.assertEqual(best_and["type"], "best_fields")
        self.assertEqual(best_and["operator"], "and")
        self.assertEqual(best_and["boost"], 5)

        phrase = should[1]["multi_match"]
        self.assertEqual(phrase["query"], "retrato de senhores")
        self.assertEqual(phrase["fields"], ["title.no_stem^8", "description.no_stem^2"])
        self.assertEqual(phrase["type"], "phrase")
        self.assertEqual(phrase["boost"], 4)

        best_or = should[2]["multi_match"]
        self.assertEqual(best_or["fields"], ["title.no_stem^3", "description.no_stem^1"])
        self.assertEqual(best_or["type"], "best_fields")
        self.assertEqual(best_or["operator"], "or")
        self.assertEqual(best_or["minimum_should_match"], "2<75%")
        self.assertEqual(best_or["boost"], 0.3)

        field_lists = [clause["multi_match"]["fields"] for clause in should]
        flattened_fields = [field for fields in field_lists for field in fields]
        self.assertNotIn("title^6", flattened_fields)
        self.assertNotIn("description^2.5", flattened_fields)

    def _lexical_wrapper_bool(self, body: dict[str, object]) -> dict[str, object]:
        queries = body["query"]["hybrid"]["queries"]
        return next(
            q["bool"]
            for q in queries
            if "bool" in q and "bool" in q["bool"]["must"][0]
        )

    def _retrieval_boost_clauses(self, body: dict[str, object]) -> list[dict[str, object]]:
        lexical_wrapper = self._lexical_wrapper_bool(body)
        should = lexical_wrapper.get("should") or []
        return [
            clause
            for clause in should
            if (
                "term" in clause
                and isinstance(clause["term"], dict)
                and "category" in clause["term"]
            )
            or (
                "match" in clause
                and isinstance(clause["match"], dict)
                and (
                    "support_or_material.text" in clause["match"]
                    or "technique.text" in clause["match"]
                )
            )
        ]

    def test_category_alias_adds_non_mandatory_category_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="show me ceramic pieces",
            lexical_query="show me ceramic pieces",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"term": {"category": {"value": "ceramica", "boost": 2.0}}},
            lexical_wrapper["should"],
        )
        self.assertNotIn(
            {"term": {"category": {"value": "ceramica", "boost": 2.0}}},
            lexical_wrapper.get("filter", []),
        )

    def test_category_and_material_aliases_add_only_should_boosts(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="show me silk dresses",
            lexical_query="show me silk dresses",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"term": {"category": {"value": "traje e aderecos", "boost": 2.0}}},
            lexical_wrapper["should"],
        )
        self.assertIn(
            {"term": {"category": {"value": "traje", "boost": 2.0}}},
            lexical_wrapper["should"],
        )
        self.assertIn(
            {"match": {"support_or_material.text": {"query": "seda", "boost": 1.5}}},
            lexical_wrapper["should"],
        )
        self.assertIn(
            {"match": {"technique.text": {"query": "seda", "boost": 1.3}}},
            lexical_wrapper["should"],
        )
        self.assertEqual(
            lexical_wrapper["filter"],
            [{"term": {"museum_id": "museum_1"}}],
        )

    def test_retrieval_boost_metadata_matches_alias_boosts(self) -> None:
        gateway = OpenSearchGateway(_settings())

        self.assertEqual(
            gateway.matched_retrieval_boosts(
                query_text="show me silk dresses",
                lexical_query="show me silk dresses",
            ),
            [
                {
                    "group": "category",
                    "kind": "term",
                    "field": "category",
                    "value": "traje e aderecos",
                    "boost": 2.0,
                    "matched_alias": "dresses",
                },
                {
                    "group": "category",
                    "kind": "term",
                    "field": "category",
                    "value": "traje",
                    "boost": 2.0,
                    "matched_alias": "dresses",
                },
                {
                    "group": "support_or_material",
                    "kind": "match",
                    "field": "support_or_material.text",
                    "query": "seda",
                    "boost": 1.5,
                    "matched_alias": "silk",
                },
                {
                    "group": "technique",
                    "kind": "match",
                    "field": "technique.text",
                    "query": "seda",
                    "boost": 1.3,
                    "matched_alias": "silk",
                },
            ],
        )

    def test_category_boost_keeps_tour_scope_filter_unchanged(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="show me tiles",
            lexical_query="show me tiles",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters={"in_tour": True},
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"term": {"category": {"value": "ceramica", "boost": 2.0}}},
            lexical_wrapper["should"],
        )
        self.assertIn({"term": {"in_tour": True}}, lexical_wrapper["filter"])
        self.assertNotIn(
            {"term": {"category": {"value": "ceramica", "boost": 2.0}}},
            lexical_wrapper["filter"],
        )

    def test_material_alias_adds_support_material_text_match_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="objetos em madeira",
            lexical_query="objetos em madeira",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"match": {"support_or_material.text": {"query": "madeira", "boost": 1.4}}},
            lexical_wrapper["should"],
        )

    def test_cetim_alias_adds_technique_text_match_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="vestidos de cetim",
            lexical_query="vestidos de cetim",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"match": {"technique.text": {"query": "cetim", "boost": 1.3}}},
            lexical_wrapper["should"],
        )
        self.assertNotIn(
            {"match": {"technique.text": {"query": "cetim", "boost": 1.3}}},
            lexical_wrapper.get("filter", []),
        )

    def test_taffeta_alias_adds_technique_text_match_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="taffeta dress",
            lexical_query="taffeta dress",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"match": {"technique.text": {"query": "tafeta", "boost": 1.3}}},
            lexical_wrapper["should"],
        )

    def test_accent_folded_category_alias_adds_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="mostra pe\u00e7as de cer\u00e2mica",
            lexical_query="mostra pe\u00e7as de cer\u00e2mica",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        lexical_wrapper = self._lexical_wrapper_bool(body)
        self.assertIn(
            {"term": {"category": {"value": "ceramica", "boost": 2.0}}},
            lexical_wrapper["should"],
        )

    def test_query_without_known_aliases_adds_no_category_or_material_boost(self) -> None:
        gateway = OpenSearchGateway(_settings())
        body = gateway._build_query_body(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="objetos bonitos para ver",
            lexical_query="objetos bonitos para ver",
            query_embedding=[0.1, 0.2, 0.3],
            top_k=5,
            filters=None,
            sort=None,
        )

        self.assertEqual(self._retrieval_boost_clauses(body), [])

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
        self.assertEqual(first_knn["visual_embedding"]["boost"], 3.0)

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

    def test_inventory_candidate_lookup_uses_keyword_and_text_inventory_fields(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()

        gateway._search_artifacts_by_inventory_candidates_once(
            client=dummy,
            inventory_numbers=["mnaz 1234", "mnaz1234"],
            top_k=3,
            museum_id="mnaz",
        )

        assert dummy.last_search is not None
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        bool_query = body["query"]["bool"]
        self.assertEqual(bool_query["filter"], [{"term": {"museum_id": "mnaz"}}])
        inventory_bool = bool_query["must"][0]["bool"]
        self.assertEqual(inventory_bool["minimum_should_match"], 1)
        should = inventory_bool["should"]
        self.assertIn({"term": {"inventory_number": "mnaz 1234"}}, should)
        self.assertIn({"term": {"inventory_number": "mnaz1234"}}, should)
        self.assertIn({"match": {"inventory_number.text": "mnaz 1234"}}, should)

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
        phrase_clause = next(clause for clause in bool_query["should"] if "match_phrase" in clause)
        self.assertEqual(phrase_clause["match_phrase"]["name"]["boost"], 1.75)
        self.assertEqual(bool_query["minimum_should_match"], 1)
        self.assertTrue(
            any("match_phrase" in clause and "name" in clause["match_phrase"] for clause in bool_query["should"])
        )

    def test_author_id_fetch_uses_authors_index_document_ids(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _DummyClient()
        gateway._client = dummy

        gateway._fetch_authors_by_ids_sync(
            author_ids=["59837", "59838", "59837"],
        )

        assert dummy.last_search is not None
        self.assertEqual(dummy.last_search["index"], "cultural_heritage_authors")
        body = dummy.last_search["body"]
        assert isinstance(body, dict)
        self.assertEqual(body["size"], 2)
        self.assertIn("biografia", body["_source"])
        self.assertEqual(body["query"], {"ids": {"values": ["59837", "59838"]}})

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
        self.assertEqual(page.query_body, dummy.last_kwargs)
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

    def test_temporal_interval_filter_uses_overlap_with_start_year_point_fallback(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        gateway._search_relevant_context_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="influencias francesas na alfaiataria portuguesa",
            lexical_query="influencias francesas alfaiataria portuguesa",
            query_embedding=[0.1, 0.2, 0.3],
            from_offset=0,
            page_size=5,
            filters={
                "_temporal_interval": {
                    "start_year": 1808,
                    "end_year": 1821,
                    "expression": "periodo joanino",
                    "confidence": 0.9,
                    "include_unknown": False,
                }
            },
            sort=None,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        queries = body["query"]["hybrid"]["queries"]
        bool_queries = [query["bool"] for query in queries if "bool" in query]
        self.assertTrue(bool_queries)
        expected_filter = {
            "bool": {
                "should": [
                    {
                        "bool": {
                            "filter": [
                                {"range": {"start_year": {"lte": 1821}}},
                                {"range": {"end_year": {"gte": 1808}}},
                            ]
                        }
                    },
                    {
                        "bool": {
                            "filter": [
                                {"range": {"start_year": {"gte": 1808, "lte": 1821}}},
                            ],
                            "must_not": [{"exists": {"field": "end_year"}}],
                        }
                    },
                ],
                "minimum_should_match": 1,
            }
        }
        for bool_query in bool_queries:
            self.assertIn(expected_filter, bool_query["filter"])

    def test_in_tour_filter_uses_boolean_term(self) -> None:
        gateway = OpenSearchGateway(_settings())
        dummy = _PagedSearchDummyClient()
        gateway._client = dummy

        gateway._search_relevant_context_page_sync(
            museum_slug="museum_1",
            museum_id="museum_1",
            query_text="vestidos de noiva",
            lexical_query="vestidos noiva",
            query_embedding=[0.1, 0.2, 0.3],
            from_offset=0,
            page_size=5,
            filters={"in_tour": True},
            sort=None,
        )

        assert dummy.last_kwargs is not None
        body = dummy.last_kwargs["body"]
        assert isinstance(body, dict)
        queries = body["query"]["hybrid"]["queries"]
        bool_queries = [query["bool"] for query in queries if "bool" in query]
        self.assertTrue(bool_queries)
        for bool_query in bool_queries:
            self.assertIn({"term": {"in_tour": True}}, bool_query["filter"])

    def test_temporal_known_year_range_policy(self) -> None:
        matches = OpenSearchGateway._temporal_known_year_matches_interval

        self.assertFalse(
            matches(
                document_start_year=1790,
                document_end_year=1800,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertTrue(
            matches(
                document_start_year=1800,
                document_end_year=1810,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertTrue(
            matches(
                document_start_year=1815,
                document_end_year=1830,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertFalse(
            matches(
                document_start_year=1822,
                document_end_year=1850,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertFalse(
            matches(
                document_start_year=None,
                document_end_year=1815,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertFalse(
            matches(
                document_start_year=None,
                document_end_year=1800,
                query_start_year=1808,
                query_end_year=1821,
            )
        )
        self.assertFalse(
            matches(
                document_start_year=None,
                document_end_year=None,
                query_start_year=1808,
                query_end_year=1821,
            )
        )

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
        self.assertEqual(first_knn["visual_embedding"]["boost"], 3.0)

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
