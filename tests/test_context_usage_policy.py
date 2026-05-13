import unittest
import asyncio
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

from app.core.config import get_settings
from app.prompts.chat_prompts import build_final_answer_prompt
from app.schemas.chat import (
    ArtifactResult,
    ChatResultsPageRequest,
    ImageMatchResult,
    TourNavigationTarget,
)
from app.services.chat_service import ChatService
from app.services.chat_session_store import ChatSessionState, ChatSessionStore, ChatTurn


class _Dummy:
    pass


class _NoTourNavigation:
    def resolve_targets(self, **_: object) -> list[dict[str, object]]:
        return []


class _PagedOpenSearchGateway:
    def __init__(self) -> None:
        self.search_page_calls: list[dict[str, object]] = []
        self.image_fetch_calls: list[dict[str, object]] = []

    async def search_relevant_context_page(self, **kwargs: object):
        self.search_page_calls.append(dict(kwargs))
        return types.SimpleNamespace(
            total=12,
            results=[
                {
                    "artifact_id": "artifact_page_4",
                    "inventory_number": "I4",
                    "title": "Vestido paginado 4",
                    "museum_id": "mnt",
                    "description": "Quarto resultado vindo diretamente do OpenSearch.",
                },
                {
                    "artifact_id": "artifact_page_5",
                    "inventory_number": "I5",
                    "title": "Vestido paginado 5",
                    "museum_id": "mnt",
                    "description": "Quinto resultado vindo diretamente do OpenSearch.",
                },
            ],
        )

    async def fetch_images_by_artifact_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.image_fetch_calls.append(dict(kwargs))
        return []


class _StructuredPagedOpenSearchGateway:
    def __init__(self) -> None:
        self.execute_calls: list[dict[str, object]] = []
        self.image_fetch_calls: list[dict[str, object]] = []

    async def execute_structured_query(self, **kwargs: object):
        self.execute_calls.append(dict(kwargs))
        return types.SimpleNamespace(
            total=7,
            items=[
                {
                    "artifact_id": "structured_page_5",
                    "inventory_number": "S5",
                    "title": "Resultado estruturado 5",
                    "museum_id": "mnt",
                    "description": "Resultado estruturado vindo diretamente do OpenSearch.",
                },
                {
                    "artifact_id": "structured_page_6",
                    "inventory_number": "S6",
                    "title": "Resultado estruturado 6",
                    "museum_id": "mnt",
                    "description": "Resultado estruturado vindo diretamente do OpenSearch.",
                },
            ],
        )

    async def fetch_images_by_artifact_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.image_fetch_calls.append(dict(kwargs))
        return []


class _LLMRewriteOk:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "vista lisboa castelo",
                "embedding_query": "vista lisboa castelo",
            }
        )


class _LLMRewriteFail:
    async def generate(self, **_: object):
        raise RuntimeError("llm unavailable")


class _LLMShouldNotBeCalled:
    async def generate(self, **_: object):
        raise AssertionError("LLM filter should have been skipped for this intent")


class _LLMRewriteEnglishLeak:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "vestidos crianca",
                "embedding_query": "dresses children",
            }
        )


class _EmbeddingOk:
    async def embed_text(self, text: str) -> list[float]:
        return [0.1, 0.2, 0.3]


class _WindowOpenSearchGateway:
    def __init__(self) -> None:
        self.search_page_calls: list[dict[str, object]] = []

    async def search_relevant_context_page(self, **kwargs: object):
        self.search_page_calls.append(dict(kwargs))
        page_size = int(kwargs.get("page_size") or 0)
        return types.SimpleNamespace(
            total=1234,
            results=[
                {
                    "artifact_id": f"artifact_{index}",
                    "inventory_number": f"I{index}",
                    "title": f"Resultado {index}",
                    "museum_id": "mnt",
                    "description": "Resultado textual paginado.",
                    "image_count": 999,
                }
                for index in range(1, page_size + 1)
            ],
        )


class _ArtifactImagesGateway:
    def __init__(self) -> None:
        self.image_fetch_calls: list[dict[str, object]] = []

    async def fetch_images_by_artifact_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.image_fetch_calls.append(dict(kwargs))
        image_hits: list[dict[str, object]] = []
        for artifact_id in kwargs.get("artifact_ids") or []:
            image_hits.extend(
                [
                    {
                        "artifact_id": artifact_id,
                        "image_id": f"{artifact_id}_image_{index}",
                        "local_path": f"{artifact_id}/image_{index}.jpg",
                    }
                    for index in range(1, 4)
                ]
            )
        return image_hits


def _build_service() -> ChatService:
    settings = get_settings()
    return ChatService(
        settings=settings,
        opensearch_gateway=_Dummy(),
        embedding_provider=_Dummy(),
        model_retrieval_service=_Dummy(),
        tour_navigation_service=_Dummy(),
        llm_service=_Dummy(),
        session_store=ChatSessionStore(settings),
    )


def _state_with_history() -> ChatSessionState:
    return ChatSessionState(
        conversation_id="conv_test",
        museum_slug="mnaz",
        rolling_summary=(
            "intent=search | user=mostra artefactos religiosos | "
            "assistant=foram encontrados varios artefactos"
        ),
        history=[
            ChatTurn(role="user", text="mostra artefactos religiosos"),
            ChatTurn(role="assistant", text="encontrei varios resultados"),
        ],
    )


class ContextUsagePolicyTests(unittest.TestCase):
    def test_case_a_follow_up_should_carry_filters_and_sort(self) -> None:
        service = _build_service()
        state = _state_with_history()

        policy_1 = service._derive_context_policy(message="agora do seculo XVII", state=state)
        policy_2 = service._derive_context_policy(message="um mais recente", state=state)

        self.assertTrue(bool(policy_1.get("is_follow_up")))
        self.assertTrue(bool(policy_1.get("use_history_for_query")))
        self.assertTrue(bool(policy_1.get("carry_filters")))
        self.assertTrue(bool(policy_2.get("is_follow_up")))
        self.assertTrue(bool(policy_2.get("carry_sort")))

    def test_case_b_count_query_should_be_standalone(self) -> None:
        service = _build_service()
        state = _state_with_history()

        policy = service._derive_context_policy(
            message="quantos azulejos cristaos?",
            state=state,
        )

        self.assertFalse(bool(policy.get("is_follow_up")))
        self.assertFalse(bool(policy.get("use_history_for_query")))
        self.assertFalse(bool(policy.get("carry_filters")))
        self.assertFalse(bool(policy.get("carry_sort")))

    def test_case_c_media_prompt_should_prioritize_retrieval_context(self) -> None:
        prompt = build_final_answer_prompt(
            museum_slug="mnaz",
            museum_name="Museu Nacional do Azulejo",
            input_modality="image",
            mode="rag",
            intent="image_search",
            rolling_summary="",
            filters_state={},
            sort_state={},
            user_message="a que peca pertence esta imagem?",
            rewritten_query="a que peca pertence esta imagem?",
            retrieval_context='[doc_1] {"title":"Painel","inventory":"MNAZ 1"}',
            use_history_for_answer=False,
        )

        self.assertIn("input_modality: image", prompt)
        self.assertIn("retrieval_context:", prompt)
        self.assertIn("fonte principal de factos", prompt)
        self.assertIn("media enviado neste turno", prompt)

    def test_case_d_greeting_should_not_use_history_for_query(self) -> None:
        service = _build_service()
        state = _state_with_history()

        policy = service._derive_context_policy(message="ola", state=state)

        self.assertFalse(bool(policy.get("use_history_for_query")))
        self.assertFalse(bool(policy.get("carry_filters")))
        self.assertFalse(bool(policy.get("carry_sort")))

    def test_pronoun_follow_up_should_use_history_for_query(self) -> None:
        service = _build_service()
        state = _state_with_history()

        policy = service._derive_context_policy(
            message="o que esta representado nele?",
            state=state,
        )

        self.assertTrue(bool(policy.get("is_follow_up")))
        self.assertTrue(bool(policy.get("use_history_for_query")))

    def test_neste_azulejo_follow_up_should_use_history_for_query(self) -> None:
        service = _build_service()
        state = _state_with_history()

        policy = service._derive_context_policy(
            message="quem existe neste azulejo como figura central?",
            state=state,
        )

        self.assertTrue(bool(policy.get("is_follow_up")))
        self.assertTrue(bool(policy.get("use_history_for_query")))

    def test_result_selection_prefers_single_inventory_match(self) -> None:
        service = _build_service()
        state = _state_with_history()
        docs = [
            {
                "artifact_id": "artifact_866",
                "inventory": "MNAz 866 Az",
                "title": "Jesus entre os Doutores",
            },
            {
                "artifact_id": "artifact_123",
                "inventory": "MNAz 123 Az",
                "title": "Outro Painel",
            },
        ]
        hinted = service._infer_selected_artifact_from_reply(
            reply_text=(
                'O azulejo "Jesus entre os Doutores" encontra-se no museu '
                "(MNAz 866 Az)."
            ),
            docs=docs,
        )
        service._update_result_selection_state(
            state=state,
            artifact_docs=docs,
            effective_filters={},
            hinted_selected_artifact_id=hinted,
        )

        self.assertEqual(state.selected_artifact_id, "artifact_866")
        self.assertEqual(state.last_result_ids, ["artifact_866", "artifact_123"])

    def test_result_selection_prefers_first_mentioned_when_multi(self) -> None:
        service = _build_service()
        state = _state_with_history()
        docs = [
            {
                "artifact_id": "artifact_866",
                "inventory": "MNAz 866 Az",
                "title": "Jesus entre os Doutores",
            },
            {
                "artifact_id": "artifact_754",
                "inventory": "MNAz 754 Proj",
                "title": "Estresido",
            },
            {
                "artifact_id": "artifact_10042",
                "inventory": "MNAz 10042 Az",
                "title": "Cristo entrega as chaves a Sao Pedro",
            },
        ]
        hinted = service._infer_selected_artifact_from_reply(
            reply_text=(
                "No museu existe Jesus entre os doutores (MNAz 866 Az), "
                "alem de Estresido (MNAz 754 Proj) e Cristo entrega as chaves "
                "a Sao Pedro (MNAz 10042 Az)."
            ),
            docs=docs,
        )
        service._update_result_selection_state(
            state=state,
            artifact_docs=docs,
            effective_filters={},
            hinted_selected_artifact_id=hinted,
        )

        self.assertEqual(state.selected_artifact_id, "artifact_866")

    def test_result_selection_defaults_to_first_id_when_multi(self) -> None:
        service = _build_service()
        state = _state_with_history()
        docs = [
            {"artifact_id": "artifact_159341", "inventory": "A"},
            {"artifact_id": "artifact_159345", "inventory": "B"},
            {"artifact_id": "artifact_159331", "inventory": "C"},
        ]

        service._update_result_selection_state(
            state=state,
            artifact_docs=docs,
            effective_filters={},
            hinted_selected_artifact_id=None,
        )

        self.assertEqual(state.selected_artifact_id, "artifact_159341")
        self.assertEqual(
            state.last_result_ids,
            ["artifact_159341", "artifact_159345", "artifact_159331"],
        )

    def test_follow_up_scope_singular_uses_selected_artifact_id(self) -> None:
        service = _build_service()
        state = _state_with_history()
        state.selected_artifact_id = "artifact_159341"
        state.last_result_ids = ["artifact_159341", "artifact_159345"]
        router_decision = {
            "mode": "rag",
            "use_history_for_query": True,
        }

        scoped = service._apply_follow_up_artifact_scope(
            message="diz os materiais desse azulejo",
            state=state,
            router_decision=router_decision,
            filters={},
        )

        self.assertEqual(scoped.get("artifact_id"), "artifact_159341")

    def test_follow_up_scope_plural_uses_last_result_ids(self) -> None:
        service = _build_service()
        state = _state_with_history()
        state.selected_artifact_id = "artifact_159341"
        state.last_result_ids = ["artifact_159341", "artifact_159345", "artifact_159331"]
        router_decision = {
            "mode": "rag",
            "use_history_for_query": True,
        }

        scoped = service._apply_follow_up_artifact_scope(
            message="e os materiais desses azulejos?",
            state=state,
            router_decision=router_decision,
            filters={},
        )

        self.assertEqual(
            scoped.get("artifact_id"),
            ["artifact_159341", "artifact_159345", "artifact_159331"],
        )

    def test_context_policy_guardrail_forces_follow_up_rag(self) -> None:
        service = _build_service()
        router_decision = {
            "mode": "llm_only",
            "intent": "overview",
            "is_follow_up": False,
            "use_history_for_query": False,
            "use_history_for_answer": False,
            "carry_filters": False,
            "carry_sort": False,
            "rewritten_query": "isso",
            "needs_retrieval": False,
            "reason": "router_low_confidence",
            "filters_delta": {},
            "sort_delta": {},
        }
        context_policy = {
            "is_follow_up": True,
            "use_history_for_query": True,
            "use_history_for_answer": True,
            "carry_filters": True,
            "carry_sort": True,
            "reason": "referential_follow_up_query",
        }

        guarded = service._apply_context_policy_guardrails(
            router_decision=router_decision,
            context_policy=context_policy,
            user_message="fala mais desse azulejo",
        )

        self.assertEqual(guarded.get("mode"), "rag")
        self.assertTrue(bool(guarded.get("use_history_for_query")))
        self.assertTrue(bool(guarded.get("carry_filters")))
        self.assertTrue(bool(guarded.get("carry_sort")))
        self.assertTrue(bool(guarded.get("needs_retrieval")))

    def test_lexical_query_strips_conversational_filler(self) -> None:
        service = _build_service()

        cleaned = service._build_lexical_query(
            query="nope, eu quero o panorama com a vista de lisboa",
            museum_slug="mnaz",
            museum_id="mnaz",
        )

        self.assertEqual(cleaned, "panorama vista lisboa")

    def test_lexical_query_keeps_only_search_relevant_terms(self) -> None:
        service = _build_service()

        cleaned = service._build_lexical_query(
            query="mostra-me por favor azulejos com iconografia mariana no museu mnaz",
            museum_slug="mnaz",
            museum_id="mnaz",
        )

        self.assertEqual(cleaned, "azulejos iconografia mariana")

    def test_structured_schema_uses_new_mapping_fields(self) -> None:
        service = _build_service()
        schema = service._build_structured_query_schema(museum_id="mnaz")

        self.assertIn("inventory_number", schema.fields)
        self.assertIn("inventory_number", schema.facetable_fields)
        self.assertIn("category.text", schema.text_fields)
        self.assertIn("support_or_material.text", schema.text_fields)
        self.assertIn("technique.text", schema.text_fields)
        self.assertIn("origin_history", schema.text_fields)
        self.assertIn("production_center.text", schema.text_fields)
        self.assertIn("incorporation.text", schema.text_fields)

    def test_retrieval_query_rewrite_uses_llm(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteOk(),
            session_store=ChatSessionStore(settings),
        )

        lexical, embedding = asyncio.run(
            service._rewrite_retrieval_query_with_llm(
                query="encontra a vista de Lisboa",
                museum_slug="mnaz",
                museum_id="mnaz",
                filters={},
                sort={},
            )
        )
        self.assertEqual(lexical, "vista lisboa castelo")
        self.assertEqual(embedding, "vista lisboa castelo")

    def test_retrieval_query_rewrite_falls_back_when_llm_fails(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        lexical, embedding = asyncio.run(
            service._rewrite_retrieval_query_with_llm(
                query="encontra a vista de Lisboa",
                museum_slug="mnaz",
                museum_id="mnaz",
                filters={},
                sort={},
            )
        )
        self.assertEqual(lexical, "")
        self.assertEqual(embedding, "")

    def test_retrieval_query_rewrite_rejects_language_mismatch(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteEnglishLeak(),
            session_store=ChatSessionStore(settings),
        )

        lexical, embedding = asyncio.run(
            service._rewrite_retrieval_query_with_llm(
                query="encontra vestidos de crianca",
                museum_slug="mnt",
                museum_id="mnt",
                filters={},
                sort={},
            )
        )
        self.assertEqual(lexical, "vestidos crianca")
        self.assertEqual(embedding, "")

    def test_text_retrieval_window_uses_results_page_size_not_candidate_count(self) -> None:
        settings = get_settings()
        previous_candidates = settings.CHAT_RETRIEVAL_CANDIDATES
        gateway = _WindowOpenSearchGateway()
        try:
            settings.CHAT_RETRIEVAL_CANDIDATES = 1000
            service = ChatService(
                settings=settings,
                opensearch_gateway=gateway,
                embedding_provider=_EmbeddingOk(),
                model_retrieval_service=_Dummy(),
                tour_navigation_service=_Dummy(),
                llm_service=_LLMRewriteFail(),
                session_store=ChatSessionStore(settings),
            )

            _, total, docs, _ = asyncio.run(
                service._retrieve_context(
                    museum_slug="mnt",
                    museum_id="mnt",
                    query="vestidos de crianca",
                    filters={},
                    sort={},
                    result_window_size=10,
                )
            )
        finally:
            settings.CHAT_RETRIEVAL_CANDIDATES = previous_candidates

        self.assertEqual(total, 1234)
        self.assertEqual(len(docs), 10)
        self.assertEqual(gateway.search_page_calls[0]["page_size"], 10)

    def test_text_artifact_hydration_limits_images_to_visible_page(self) -> None:
        settings = get_settings()
        gateway = _ArtifactImagesGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )
        docs = [
            {
                "artifact_id": f"artifact_{index}",
                "inventory_number": f"I{index}",
                "title": f"Resultado {index}",
                "museum_id": "mnt",
                "image_count": 999,
            }
            for index in range(1, 11)
        ]

        artifacts = asyncio.run(
            service._build_artifact_results(
                museum_slug="mnt",
                museum_id="mnt",
                artifact_docs=docs,
                max_images_per_artifact=1,
            )
        )

        self.assertEqual(len(artifacts), 10)
        self.assertEqual(len(gateway.image_fetch_calls), 1)
        self.assertEqual(gateway.image_fetch_calls[0]["per_artifact"], 1)
        self.assertEqual(gateway.image_fetch_calls[0]["max_total"], 10)
        self.assertTrue(all(len(artifact.images) <= 1 for artifact in artifacts))

    def test_docs_llm_filter_is_skipped_for_search_intent(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMShouldNotBeCalled(),
            session_store=ChatSessionStore(settings),
        )
        docs = [
            {"artifact_id": "a1", "title": "Vestido 1", "description": "desc"},
            {"artifact_id": "a2", "title": "Vestido 2", "description": "desc"},
        ]

        filtered = asyncio.run(
            service._filter_docs_with_llm(
                docs=docs,
                user_message="encontra vestidos de crianca",
                museum_slug="mnt",
                intent="search",
                model_override=None,
                system_prompt=None,
            )
        )

        self.assertEqual(filtered, docs)

    def test_image_matches_llm_filter_is_skipped_for_image_search_intent(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMShouldNotBeCalled(),
            session_store=ChatSessionStore(settings),
        )
        image_matches = [
            types.SimpleNamespace(
                original_image_name="img1.jpg",
                artifact_id="a1",
                score=0.9,
                title="Vestido 1",
                inventory="I1",
            ),
            types.SimpleNamespace(
                original_image_name="img2.jpg",
                artifact_id="a2",
                score=0.8,
                title="Vestido 2",
                inventory="I2",
            ),
        ]

        filtered = asyncio.run(
            service._filter_image_matches_with_llm(
                image_matches=image_matches,
                user_message="encontra vestidos de crianca",
                museum_slug="mnt",
                intent="image_search",
                model_override=None,
                system_prompt=None,
            )
        )

        self.assertEqual(filtered, image_matches)

    def test_paginate_results_keeps_order_and_reports_has_more(self) -> None:
        service = _build_service()
        state = _state_with_history()
        artifacts = [
            ArtifactResult(artifact_id=f"a{index}", inventory_number=f"I{index}")
            for index in range(1, 7)
        ]
        image_matches = [
            ImageMatchResult(
                original_image_name=f"img_{index}.jpg",
                artifact_id=f"a{index}",
                inventory=f"I{index}",
            )
            for index in range(1, 7)
        ]
        navigation_targets = [
            TourNavigationTarget(
                overlay_id=f"ov_{index}",
                panorama_key=f"pano_{index}",
                inventory_id=f"I{index}",
            )
            for index in range(1, 7)
        ]

        (
            paged_artifacts,
            paged_image_matches,
            paged_navigation_targets,
            results_page,
            results_page_size,
            results_total,
            results_has_more,
        ) = service._build_paged_results(
            state=state,
            artifact_results=artifacts,
            image_matches=image_matches,
            navigation_targets=navigation_targets,
            page=2,
            page_size=2,
            default_page_size=2,
        )

        self.assertEqual(results_page, 2)
        self.assertEqual(results_page_size, 2)
        self.assertEqual(results_total, 6)
        self.assertTrue(results_has_more)
        self.assertEqual([item.artifact_id for item in paged_artifacts], ["a3", "a4"])
        self.assertEqual(
            [item.artifact_id for item in paged_image_matches],
            ["a3", "a4"],
        )
        self.assertEqual(
            [item.inventory_id for item in paged_navigation_targets],
            ["I3", "I4"],
        )

    def test_get_results_page_returns_empty_for_missing_session(self) -> None:
        service = _build_service()
        response = asyncio.run(
            service.get_results_page(
                ChatResultsPageRequest(
                    museum_slug="mnaz",
                    museum_id="mnaz",
                    conversation_id="missing-conversation",
                    results_page=3,
                    results_page_size=4,
                )
            )
        )

        self.assertEqual(response.results_page, 3)
        self.assertEqual(response.results_page_size, 4)
        self.assertEqual(response.results_total, 0)
        self.assertFalse(response.results_has_more)
        self.assertEqual(response.artifact_results, [])
        self.assertEqual(response.image_matches, [])

    def test_get_results_page_materializes_text_page_from_opensearch(self) -> None:
        settings = get_settings()
        session_store = ChatSessionStore(settings)
        gateway = _PagedOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=session_store,
        )
        state = ChatSessionState(conversation_id="conv_page", museum_slug="mnt")
        state.last_paged_results_default_page_size = 2
        state.last_paged_retrieval_request = {
            "kind": "text",
            "museum_id": "mnt",
            "query_text": "vestidos crianca",
            "lexical_query": "vestidos crianca",
            "query_embedding": [0.1, 0.2, 0.3],
            "filters": {},
            "sort": {},
            "results_total": 12,
        }
        session_store.save(state)

        response = asyncio.run(
            service.get_results_page(
                ChatResultsPageRequest(
                    museum_slug="mnt",
                    museum_id="mnt",
                    conversation_id="conv_page",
                    results_page=2,
                    results_page_size=2,
                )
            )
        )

        self.assertEqual(response.results_page, 2)
        self.assertEqual(response.results_page_size, 2)
        self.assertEqual(response.results_total, 12)
        self.assertTrue(response.results_has_more)
        self.assertEqual(
            [artifact.artifact_id for artifact in response.artifact_results],
            ["artifact_page_4", "artifact_page_5"],
        )
        self.assertEqual(len(gateway.search_page_calls), 1)
        self.assertEqual(gateway.search_page_calls[0]["from_offset"], 2)
        self.assertEqual(gateway.search_page_calls[0]["page_size"], 2)
        self.assertEqual(len(gateway.image_fetch_calls), 1)

    def test_get_results_page_materializes_structured_list_page_from_opensearch(self) -> None:
        settings = get_settings()
        session_store = ChatSessionStore(settings)
        gateway = _StructuredPagedOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=session_store,
        )
        state = ChatSessionState(conversation_id="conv_structured_page", museum_slug="mnt")
        state.last_paged_results_default_page_size = 2
        state.last_paged_retrieval_request = {
            "kind": "structured_list",
            "museum_id": "mnt",
            "plan": {
                "mode": "structured",
                "operation": "list",
                "confidence": 1.0,
                "query_text": "vestidos",
                "filters": [],
                "list_spec": {"limit": 2, "fields": [], "sort": []},
            },
            "dsl": {
                "endpoint": "_search",
                "index": "cultural_heritage_artifacts",
                "body": {"size": 2, "query": {"match_all": {}}},
            },
            "results_total": 7,
        }
        session_store.save(state)

        response = asyncio.run(
            service.get_results_page(
                ChatResultsPageRequest(
                    museum_slug="mnt",
                    museum_id="mnt",
                    conversation_id="conv_structured_page",
                    results_page=3,
                    results_page_size=2,
                )
            )
        )

        self.assertEqual(response.results_page, 3)
        self.assertEqual(response.results_page_size, 2)
        self.assertEqual(response.results_total, 7)
        self.assertTrue(response.results_has_more)
        self.assertEqual(
            [artifact.artifact_id for artifact in response.artifact_results],
            ["structured_page_5", "structured_page_6"],
        )
        self.assertEqual(len(gateway.execute_calls), 1)
        dsl = gateway.execute_calls[0]["dsl"]
        self.assertEqual(dsl.body["from"], 4)
        self.assertEqual(dsl.body["size"], 2)
        self.assertTrue(dsl.body["track_total_hits"])


if __name__ == "__main__":
    unittest.main()
