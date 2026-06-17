import unittest
import asyncio
from pathlib import Path
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

from app.core.config import Settings, get_settings
from app.prompts.chat_prompts import build_final_answer_prompt
from app.prompts.query_planner_prompts import build_retrieval_query_rewrite_prompt
from app.schemas.chat import (
    ArtifactResult,
    ChatMessageRequest,
    ChatResultsPageRequest,
    ImageMatchResult,
    TourNavigationTarget,
)
from app.services.chat_service import ChatService, TemporalQuery
from app.services.chat_session_store import ChatSessionState, ChatSessionStore, ChatTurn


class _Dummy:
    pass


class _NoTourNavigation:
    def resolve_targets(self, **_: object) -> list[dict[str, object]]:
        return []


class _EchoTourNavigation:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def resolve_targets(self, **kwargs: object) -> list[dict[str, object]]:
        self.calls.append(dict(kwargs))
        inventories = [str(value) for value in kwargs.get("inventories") or []]
        limit = int(kwargs.get("limit") or len(inventories) or 1)
        return [
            {
                "overlay_id": f"ov_{inventory}",
                "panorama_key": f"pano_{inventory}",
                "inventory_id": inventory,
                "location": "Sala",
                "title": f"Target {inventory}",
            }
            for inventory in inventories[:limit]
        ]


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


class _LLMTemporalPeriods:
    async def generate(self, **kwargs: object):
        message = str(kwargs.get("message") or "").casefold()
        if "periodo regencial" in message:
            return types.SimpleNamespace(
                parsed_json={
                    "start_year": 1831,
                    "end_year": 1840,
                    "expression": "periodo regencial",
                    "confidence": 0.86,
                }
            )
        if "periodo pombalino" in message:
            return types.SimpleNamespace(
                parsed_json={
                    "start_year": 1750,
                    "end_year": 1777,
                    "expression": "periodo pombalino",
                    "confidence": 0.91,
                }
            )
        if "periodo joanino" in message:
            return types.SimpleNamespace(
                parsed_json={
                    "start_year": 1808,
                    "end_year": 1821,
                    "expression": "periodo joanino",
                    "confidence": 0.92,
                }
            )
        return types.SimpleNamespace(
            parsed_json={
                "start_year": None,
                "end_year": None,
                "expression": None,
                "confidence": 0.0,
            }
        )


class _LLMRewriteFailTemporalPeriods(_LLMTemporalPeriods):
    async def generate(self, **kwargs: object):
        message = str(kwargs.get("message") or "").casefold()
        if "interpreta referencias temporais" in message:
            return await super().generate(**kwargs)
        raise RuntimeError("rewrite unavailable")


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


class _LLMRewriteHeadgearLeak:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "chapeus",
                "embedding_query": "headgear",
            }
        )


class _LLMRewriteDropsDates:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "transformacoes do traje cerimonial portugues",
            }
        )


class _LLMRewriteLeaksTemporalPeriod:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "trajes periodo pombalino",
            }
        )


class _LLMRewriteLeaksTourScope:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "vestidos de noiva nesta visita virtual",
            }
        )


class _LLMRewriteWeddingDress:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "lexical_query": "vestidos de noiva",
            }
        )


class _LLMRewriteMuseumQuestionExamples:
    async def generate(self, **kwargs: object):
        message = str(kwargs.get("message") or "")
        query = message.rsplit("user_query:", 1)[-1]
        query = query.split("active_filters_json:", 1)[0].casefold()
        if "personalidades sepultadas" in query:
            return types.SimpleNamespace(
                parsed_json={
                    "lexical_query": "personalidades sepultadas nos Jerónimos",
                }
            )
        if "15 minutos" in query:
            return types.SimpleNamespace(
                parsed_json={
                    "lexical_query": "objetos",
                }
            )
        raise RuntimeError("unexpected rewrite prompt")


class _LLMRouterSearchAsLlmOnly:
    async def generate(self, **_: object):
        return types.SimpleNamespace(
            parsed_json={
                "mode": "llm_only",
                "intent": "search",
                "is_follow_up": False,
                "use_history_for_query": False,
                "use_history_for_answer": False,
                "carry_filters": False,
                "carry_sort": False,
                "rewritten_query": "sapatos dos anos 20",
                "needs_retrieval": False,
                "reason": "router_claimed_general_advice",
                "filters_delta": {},
                "sort_delta": {},
            }
        )


class _EmbeddingOk:
    async def embed_text(self, text: str) -> list[float]:
        return [0.1, 0.2, 0.3]


class _EmbeddingShouldNotBeCalled:
    async def embed_text(self, text: str) -> list[float]:
        raise AssertionError(f"embedding should not have been called for {text}")


class _WindowOpenSearchGateway:
    def __init__(
        self,
        inventory_results: list[dict[str, object]] | None = None,
        retrieval_boosts: list[dict[str, object]] | None = None,
    ) -> None:
        self.search_page_calls: list[dict[str, object]] = []
        self.inventory_lookup_calls: list[dict[str, object]] = []
        self.inventory_results = inventory_results or []
        self.retrieval_boosts = retrieval_boosts or []

    def matched_retrieval_boosts(self, **_: object) -> list[dict[str, object]]:
        return list(self.retrieval_boosts)

    async def search_artifacts_by_inventory_candidates(self, **kwargs: object):
        self.inventory_lookup_calls.append(dict(kwargs))
        return list(self.inventory_results)

    async def search_relevant_context_page(self, **kwargs: object):
        self.search_page_calls.append(dict(kwargs))
        page_size = int(kwargs.get("page_size") or 0)
        return types.SimpleNamespace(
            total=1234,
            query_body={
                "index": "cultural_heritage_artifacts",
                "body": {"query": {"match_all": {}}},
            },
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


class _RelatedArtifactsImageGateway:
    def __init__(self) -> None:
        self.image_fetch_calls: list[dict[str, object]] = []
        self.fetch_by_entity_calls: list[dict[str, object]] = []

    async def fetch_artifacts_by_ids(self, **_: object) -> list[dict[str, object]]:
        return [
            {
                "artifact_id": "artifact_current",
                "inventory_number": "CURRENT",
                "set_ids": ["conjunto:1"],
                "exhibition_ids": ["exposicao:fisica:2"],
            }
        ]

    async def fetch_entities_by_ids(self, **kwargs: object) -> list[dict[str, object]]:
        tipo = kwargs.get("tipo")
        if tipo == "conjunto":
            return [{"entity_id": "conjunto:1", "name": "Conjunto 1"}]
        if tipo == "exposicao":
            return [{"entity_id": "exposicao:fisica:2", "name": "Exposicao 2"}]
        return []

    async def fetch_artifacts_by_entity(self, **kwargs: object) -> tuple[list[dict[str, object]], int]:
        self.fetch_by_entity_calls.append(dict(kwargs))
        tipo = kwargs.get("tipo")
        if tipo == "exposicao":
            return (
                [
                    {
                        "artifact_id": "artifact_exhibition_1",
                        "inventory_number": "EXH1",
                        "title": "Relacionado exposicao",
                        "museum_id": "mnt",
                        "image_paths": ["fallback/exhibition.jpg"],
                    }
                ],
                1,
            )
        return (
            [
                {
                    "artifact_id": "artifact_related_1",
                    "inventory_number": "REL1",
                    "title": "Relacionado 1",
                    "museum_id": "mnt",
                    "image_paths": ["fallback/related_1.jpg"],
                },
                {
                    "artifact_id": "artifact_related_2",
                    "inventory_number": "REL2",
                    "title": "Relacionado 2",
                    "museum_id": "mnt",
                    "image_paths": ["fallback/related_2.jpg"],
                },
            ],
            2,
        )

    async def fetch_images_by_artifact_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.image_fetch_calls.append(dict(kwargs))
        return [
            {
                "artifact_id": artifact_id,
                "image_id": f"{artifact_id}_ordered",
                "image_order": 1,
                "local_path": f"ordered/{artifact_id}.jpg",
            }
            for artifact_id in kwargs.get("artifact_ids") or []
        ]


class _AuthorDetailGateway:
    def __init__(self, *, with_creator_ids: bool) -> None:
        self.with_creator_ids = with_creator_ids
        self.entity_fetch_calls: list[dict[str, object]] = []
        self.author_id_fetch_calls: list[dict[str, object]] = []
        self.author_name_fetch_calls: list[dict[str, object]] = []

    async def fetch_artifacts_by_ids(self, **_: object) -> list[dict[str, object]]:
        doc: dict[str, object] = {
            "artifact_id": "artifact_author",
            "inventory_number": "AUTH1",
            "title": "Artefacto com autor",
            "creators": ["Fernando Pessoa"],
        }
        if self.with_creator_ids:
            doc["creator_ids"] = ["59837"]
        return [doc]

    async def fetch_entities_by_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.entity_fetch_calls.append(dict(kwargs))
        return []

    async def fetch_authors_by_ids(self, **kwargs: object) -> list[dict[str, object]]:
        self.author_id_fetch_calls.append(dict(kwargs))
        if "59837" in (kwargs.get("author_ids") or []):
            return [
                {
                    "entity_id": "59837",
                    "name": "Fernando Pessoa",
                    "atividade": "Escritor",
                    "biography": "Biografia enriquecida do indice de autores.",
                    "url": "https://example.test/autor/59837",
                    "n_objetos": 3,
                }
            ]
        return []

    async def fetch_authors_by_names(self, **kwargs: object) -> list[dict[str, object]]:
        self.author_name_fetch_calls.append(dict(kwargs))
        if "Fernando Pessoa" in (kwargs.get("names") or []):
            return [
                {
                    "entity_id": "autor:fernando-pessoa",
                    "name": "Fernando Pessoa",
                    "atividade": "Escritor",
                    "biography": "Biografia encontrada por nome.",
                    "n_objetos": 2,
                }
            ]
        return []


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
    def test_query_log_default_path_uses_evaluation_directory(self) -> None:
        settings = Settings()
        expected = Path(__file__).resolve().parents[1] / "evaluation" / "backend_queries.jsonl"

        self.assertEqual(settings.QUERY_LOG_PATH, "evaluation/backend_queries.jsonl")
        self.assertEqual(settings.query_log_path_resolved, expected.resolve())

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

    def test_final_prompt_uses_selected_english_language(self) -> None:
        prompt = build_final_answer_prompt(
            museum_slug="mnaz",
            museum_name="Museu Nacional do Azulejo",
            input_modality="text",
            mode="llm_only",
            intent="fallback",
            rolling_summary="",
            filters_state={},
            sort_state={},
            user_message="hello",
            rewritten_query="hello",
            retrieval_context="",
            use_history_for_answer=False,
            language="en",
        )

        self.assertIn("Final answer language: English.", prompt)
        self.assertIn("Write the final answer fully in English.", prompt)

    def test_status_updates_use_selected_english_language(self) -> None:
        service = _build_service()
        events: list[dict[str, object]] = []

        async def collect(event: dict[str, object]) -> None:
            events.append(event)

        asyncio.run(
            service._emit_status(
                collect,
                "status.artifacts_found",
                language="en",
                artifact_count=2,
            )
        )

        self.assertEqual(events[0]["message"], "Found 2 artifacts")

    def test_sanitizer_keeps_english_reply_english(self) -> None:
        service = _build_service()
        reply = service._sanitize_assistant_reply(
            "Based on the information provided by the context, see [doc_1].",
            docs=[{"title": "Tile Panel", "inventory_number": "MNAZ 1"}],
            language="en",
        )

        self.assertEqual(reply, 'see the artifact "Tile Panel" (MNAZ 1).')

    def test_sanitizer_renumbers_repeated_ordered_list_markers(self) -> None:
        service = _build_service()
        reply = service._sanitize_assistant_reply(
            "Resultados:\n\n"
            "1. Vestido (1950-1960)\n\n"
            "1. Vestido (1970)\n\n"
            "1. Conjunto (1944)\n\n"
            "Nota final.",
            language="pt",
        )

        self.assertEqual(
            reply,
            "Resultados:\n\n"
            "1. Vestido (1950-1960)\n\n"
            "2. Vestido (1970)\n\n"
            "3. Conjunto (1944)\n\n"
            "Nota final.",
        )

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

    def test_tour_scope_query_should_not_use_artifact_context(self) -> None:
        service = _build_service()
        state = _state_with_history()
        state.filters = {"artifact_id": "artifact_159341"}

        policy = service._derive_context_policy(
            message="E consegues encontrar chapeus nesta visita?",
            state=state,
        )

        self.assertFalse(bool(policy.get("is_follow_up")))
        self.assertFalse(bool(policy.get("use_history_for_query")))
        self.assertFalse(bool(policy.get("carry_filters")))
        self.assertFalse(bool(policy.get("carry_sort")))

    def test_last_result_ids_updates_without_selected_artifact(self) -> None:
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

        service._update_last_result_ids(
            state=state,
            artifact_docs=docs,
        )

        self.assertFalse(hasattr(state, "selected_artifact_id"))
        self.assertEqual(state.last_result_ids, ["artifact_866", "artifact_123"])

    def test_artifact_id_filter_is_not_persisted_to_state(self) -> None:
        service = _build_service()
        state = _state_with_history()
        router_decision = {
            "mode": "rag",
            "intent": "search",
            "filters_delta": {
                "artifact_id": "artifact_159341",
                "category": "pintura",
            },
            "sort_delta": {},
        }

        service._apply_router_decision_to_state(
            state=state,
            router_decision=router_decision,
        )

        self.assertNotIn("artifact_id", state.filters)
        self.assertEqual(state.filters.get("category"), "pintura")

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

    def test_router_search_intent_cannot_be_llm_only(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRouterSearchAsLlmOnly(),
            session_store=ChatSessionStore(settings),
        )
        state = ChatSessionState(conversation_id="conv_router", museum_slug="mnt")

        decision = asyncio.run(
            service._route_message(
                payload=ChatMessageRequest(
                    museum_slug="mnt",
                    museum_id="mnt",
                    message=(
                        "Olá, eu sou um estudante de design e quero ideias para o meu novo "
                        "projeto, para isso queria que me encontrasses sapatos dos anos 20"
                    ),
                ),
                state=state,
                context_policy={
                    "is_follow_up": False,
                    "use_history_for_query": False,
                    "use_history_for_answer": False,
                    "carry_filters": False,
                    "carry_sort": False,
                    "reason": "no_previous_context",
                },
            )
        )

        self.assertEqual(decision["intent"], "search")
        self.assertEqual(decision["mode"], "rag")
        self.assertTrue(bool(decision["needs_retrieval"]))
        self.assertIn("guardrail_search_requires_retrieval", str(decision["reason"]))

    def test_router_failure_fallback_uses_llm_only_for_obvious_greeting(self) -> None:
        service = _build_service()

        decision = service._fallback_router_decision(
            "olá",
            context_policy={
                "is_follow_up": False,
                "use_history_for_answer": False,
                "carry_filters": True,
                "carry_sort": True,
            },
        )

        self.assertEqual(decision["mode"], "llm_only")
        self.assertEqual(decision["intent"], "fallback")
        self.assertFalse(bool(decision["needs_retrieval"]))
        self.assertEqual(decision["rewritten_query"], "olá")
        self.assertEqual(
            decision["reason"],
            "router_unavailable_deterministic_fallback_llm_only",
        )
        self.assertFalse(bool(decision["carry_filters"]))
        self.assertFalse(bool(decision["carry_sort"]))

    def test_router_failure_fallback_defaults_to_rag_for_search_and_factual_messages(self) -> None:
        service = _build_service()
        messages = [
            "encontra vestidos de noiva",
            "há azulejos do século XVIII nesta visita?",
            "quem fez esta peça?",
        ]

        for message in messages:
            with self.subTest(message=message):
                decision = service._fallback_router_decision(
                    message,
                    context_policy={
                        "is_follow_up": False,
                        "use_history_for_answer": True,
                        "carry_filters": True,
                        "carry_sort": True,
                    },
                )

                self.assertEqual(decision["mode"], "rag")
                self.assertEqual(decision["intent"], "search")
                self.assertTrue(bool(decision["needs_retrieval"]))
                self.assertEqual(decision["rewritten_query"], message)
                self.assertEqual(
                    decision["reason"],
                    "router_unavailable_deterministic_fallback_rag",
                )
                self.assertFalse(bool(decision["use_history_for_query"]))
                self.assertTrue(bool(decision["use_history_for_answer"]))
                self.assertFalse(bool(decision["carry_filters"]))
                self.assertFalse(bool(decision["carry_sort"]))
                self.assertEqual(decision["filters_delta"], {})
                self.assertEqual(decision["sort_delta"], {})

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

    def test_inventory_candidate_extractor_is_conservative(self) -> None:
        service = _build_service()

        spaced = service._extract_inventory_candidates("mostra a peca MNAZ 1234")
        compact = service._extract_inventory_candidates("MNAZ1234")
        explicit = service._extract_inventory_candidates("numero de inventario 1234")
        piece_number = service._extract_inventory_candidates("mostra a peca 557")
        piece_number_marker = service._extract_inventory_candidates("mostra a peca numero 557")
        slash_number = service._extract_inventory_candidates("mostra a peca 3573/8")

        self.assertIn("mnaz 1234", spaced)
        self.assertIn("mnaz1234", spaced)
        self.assertIn("mnaz1234", compact)
        self.assertIn("mnaz 1234", compact)
        self.assertIn("1234", explicit)
        self.assertIn("557", piece_number)
        self.assertIn("557", piece_number_marker)
        self.assertIn("3573 8", slash_number)
        self.assertIn("35738", slash_number)
        self.assertEqual(service._extract_inventory_candidates("mostra objetos de 1750"), [])
        self.assertEqual(service._extract_inventory_candidates("mostra a peca de 1750"), [])
        self.assertEqual(service._extract_inventory_candidates("objetos do seculo XVIII"), [])

    def test_inventory_lookup_short_circuits_normal_text_retrieval_when_found(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway(
            inventory_results=[
                {
                    "artifact_id": "artifact_mnaz_1234",
                    "inventory_number": "MNAZ 1234",
                    "title": "Painel de azulejos",
                    "museum_id": "mnaz",
                    "description": "Resultado por numero de inventario.",
                }
            ]
        )
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingShouldNotBeCalled(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMShouldNotBeCalled(),
            session_store=ChatSessionStore(settings),
        )

        context, total, docs, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mnaz",
                museum_id="mnaz",
                query="mostra a peca MNAZ 1234",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(total, 1)
        self.assertIn("Painel de azulejos", context)
        self.assertEqual(docs[0]["artifact_id"], "artifact_mnaz_1234")
        self.assertEqual(gateway.search_page_calls, [])
        self.assertEqual(gateway.inventory_lookup_calls[0]["museum_id"], "mnaz")
        self.assertIn("mnaz 1234", gateway.inventory_lookup_calls[0]["inventory_numbers"])
        self.assertEqual(retrieval_request["kind"], "inventory")
        self.assertEqual(retrieval_request["query_text"], "mostra a peca MNAZ 1234")

    def test_bare_piece_number_lookup_short_circuits_normal_text_retrieval_when_found(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway(
            inventory_results=[
                {
                    "artifact_id": "artifact_mnt_557",
                    "inventory_number": "557",
                    "title": "Fivela",
                    "museum_id": "mnt",
                    "description": "Resultado por numero de inventario simples.",
                }
            ]
        )
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingShouldNotBeCalled(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMShouldNotBeCalled(),
            session_store=ChatSessionStore(settings),
        )

        context, total, docs, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="mostra a peca 557",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(total, 1)
        self.assertIn("Fivela", context)
        self.assertEqual(docs[0]["artifact_id"], "artifact_mnt_557")
        self.assertEqual(gateway.search_page_calls, [])
        self.assertEqual(gateway.inventory_lookup_calls[0]["museum_id"], "mnt")
        self.assertIn("557", gateway.inventory_lookup_calls[0]["inventory_numbers"])
        self.assertEqual(retrieval_request["kind"], "inventory")

    def test_compact_inventory_number_lookup_is_attempted_then_falls_back(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnaz",
                museum_id="mnaz",
                query="MNAZ1234",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(len(gateway.inventory_lookup_calls), 1)
        self.assertIn("mnaz1234", gateway.inventory_lookup_calls[0]["inventory_numbers"])
        self.assertEqual(len(gateway.search_page_calls), 1)

    def test_plain_year_query_does_not_attempt_inventory_lookup(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnaz",
                museum_id="mnaz",
                query="mostra objetos de 1750",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.inventory_lookup_calls, [])
        self.assertEqual(len(gateway.search_page_calls), 1)

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
        self.assertEqual(embedding, "")

    def test_temporal_query_extracts_explicit_year_interval(self) -> None:
        service = _build_service()

        temporal_query = asyncio.run(
            service._interpret_temporal_query(
                "transformacoes do traje cerimonial portugues entre 1750 e 1910"
            )
        )

        self.assertEqual(
            temporal_query,
            TemporalQuery(
                start_year=1750,
                end_year=1910,
                expression="entre 1750 e 1910",
                confidence=1.0,
            ),
        )

    def test_temporal_query_resolves_implicit_historical_period(self) -> None:
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

        temporal_query = asyncio.run(
            service._interpret_temporal_query(
                "influencias francesas na alfaiataria portuguesa do periodo joanino"
            )
        )

        self.assertEqual(
            temporal_query,
            TemporalQuery(
                start_year=1706,
                end_year=1750,
                expression="periodo joanino",
                confidence=1.0,
            ),
        )

    def test_temporal_query_resolves_pombaline_period(self) -> None:
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

        temporal_query = asyncio.run(
            service._interpret_temporal_query("encontra trajes do periodo pombalino")
        )

        self.assertEqual(
            temporal_query,
            TemporalQuery(
                start_year=1750,
                end_year=1777,
                expression="periodo pombalino",
                confidence=1.0,
            ),
        )

    def test_temporal_query_resolves_curated_historical_periods(self) -> None:
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

        cases = [
            ("pecas do periodo manuelino", TemporalQuery(1495, 1521, "periodo manuelino", 1.0)),
            ("trajes sebastianistas", TemporalQuery(1578, 1580, "periodo sebastianista", 1.0)),
            ("objetos da crise de sucessao", TemporalQuery(1578, 1580, "periodo sebastianista", 1.0)),
            ("moda do periodo miguelista", TemporalQuery(1828, 1834, "periodo miguelista", 1.0)),
        ]

        for query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(
                    asyncio.run(service._interpret_temporal_query(query)),
                    expected,
                )

    def test_temporal_query_uses_llm_for_non_curated_period(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMTemporalPeriods(),
            session_store=ChatSessionStore(settings),
        )

        temporal_query = asyncio.run(
            service._interpret_temporal_query("trajes do periodo regencial")
        )

        self.assertEqual(
            temporal_query,
            TemporalQuery(
                start_year=1831,
                end_year=1840,
                expression="periodo regencial",
                confidence=0.86,
            ),
        )

    def test_temporal_query_uses_llm_for_joao_vi_period(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMTemporalPeriods(),
            session_store=ChatSessionStore(settings),
        )

        temporal_query = asyncio.run(
            service._interpret_temporal_query("trajes do periodo joanino de D. Joao VI")
        )

        self.assertEqual(
            temporal_query,
            TemporalQuery(
                start_year=1808,
                end_year=1821,
                expression="periodo joanino",
                confidence=0.92,
            ),
        )

    def test_temporal_query_ignores_query_without_temporal_reference(self) -> None:
        service = _build_service()

        temporal_query = asyncio.run(
            service._interpret_temporal_query("encontra vestidos de noiva em seda")
        )

        self.assertEqual(temporal_query, TemporalQuery(None, None, None, None))

    def test_temporal_expression_is_removed_from_search_query_text(self) -> None:
        service = _build_service()

        cases = [
            (
                "Podes gerar uma cronologia do traje cerimonial entre 1750 e 1910?",
                TemporalQuery(1750, 1910, "entre 1750 e 1910", 1.0),
                "Podes gerar uma cronologia do traje cerimonial",
            ),
            (
                "influencias francesas na alfaiataria portuguesa do periodo joanino",
                TemporalQuery(1706, 1750, "periodo joanino", 1.0),
                "influencias francesas na alfaiataria portuguesa",
            ),
            (
                "encontra trajes do periodo pombalino",
                TemporalQuery(1750, 1777, "periodo pombalino", 1.0),
                "encontra trajes",
            ),
            (
                "trajes sebastianistas",
                TemporalQuery(1578, 1580, "periodo sebastianista", 1.0),
                "trajes",
            ),
        ]

        for query, temporal_query, expected in cases:
            with self.subTest(query=query):
                self.assertEqual(
                    service._strip_temporal_expression_from_query(query, temporal_query),
                    expected,
                )

    def test_tour_scope_expression_is_removed_from_search_query_text(self) -> None:
        service = _build_service()

        cases = [
            (
                "encontra vestidos de noiva nesta visita virtual",
                "encontra vestidos de noiva",
            ),
            (
                "mostra chapeus no tour",
                "mostra chapeus",
            ),
            (
                "blablabla nesta visita virtual",
                "blablabla",
            ),
            (
                "show dresses in this virtual tour",
                "show dresses",
            ),
        ]

        for query, expected in cases:
            with self.subTest(query=query):
                expression = service._extract_tour_scope_expression(query)
                self.assertIsNotNone(expression)
                self.assertEqual(
                    service._strip_tour_scope_expression_from_query(query, expression),
                    expected,
                )

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

    def test_text_retrieval_ignores_llm_embedding_query_translation(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteEnglishLeak(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra vestidos de crianca",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "vestidos crianca")
        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra vestidos de crianca")

    def test_text_retrieval_applies_explicit_year_interval_filter(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteDropsDates(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query=(
                    "Podes gerar uma cronologia das principais transformacoes "
                    "do traje cerimonial portugues entre 1750 e 1910?"
                ),
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(
            gateway.search_page_calls[0]["lexical_query"],
            "transformacoes do traje cerimonial portugues",
        )
        self.assertEqual(
            gateway.search_page_calls[0]["query_text"],
            "Podes gerar uma cronologia das principais transformacoes do traje cerimonial portugues",
        )
        self.assertEqual(
            gateway.search_page_calls[0]["filters"].get("_temporal_interval"),
            {
                "start_year": 1750,
                "end_year": 1910,
                "expression": "entre 1750 e 1910",
                "confidence": 1.0,
                "include_unknown": False,
            },
        )

    def test_text_retrieval_applies_implicit_historical_period_filter(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFailTemporalPeriods(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="influencias francesas na alfaiataria portuguesa do periodo joanino",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(
            gateway.search_page_calls[0]["query_text"],
            "influencias francesas na alfaiataria portuguesa",
        )
        self.assertEqual(
            gateway.search_page_calls[0]["lexical_query"],
            "influencias francesas alfaiataria portuguesa",
        )
        self.assertEqual(
            gateway.search_page_calls[0]["filters"].get("_temporal_interval"),
            {
                "start_year": 1706,
                "end_year": 1750,
                "expression": "periodo joanino",
                "confidence": 1.0,
                "include_unknown": False,
            },
        )

    def test_text_retrieval_applies_pombaline_period_filter(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFailTemporalPeriods(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra trajes do periodo pombalino",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra trajes")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "trajes")
        self.assertEqual(
            gateway.search_page_calls[0]["filters"].get("_temporal_interval"),
            {
                "start_year": 1750,
                "end_year": 1777,
                "expression": "periodo pombalino",
                "confidence": 1.0,
                "include_unknown": False,
            },
        )

    def test_text_retrieval_strips_temporal_period_from_llm_rewrite_output(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteLeaksTemporalPeriod(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra trajes do periodo pombalino",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra trajes")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "trajes")

    def test_text_retrieval_uses_llm_for_non_curated_period_filter(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFailTemporalPeriods(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra trajes do periodo regencial",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra trajes")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "trajes")
        self.assertEqual(
            gateway.search_page_calls[0]["filters"].get("_temporal_interval"),
            {
                "start_year": 1831,
                "end_year": 1840,
                "expression": "periodo regencial",
                "confidence": 0.86,
                "include_unknown": False,
            },
        )

    def test_text_retrieval_without_temporal_reference_keeps_filters_unchanged(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra vestidos de noiva em seda",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["filters"], {})

    def test_text_retrieval_logs_matched_alias_boosts(self) -> None:
        settings = get_settings()
        retrieval_boosts = [
            {
                "group": "support_or_material",
                "kind": "match",
                "field": "support_or_material.text",
                "query": "seda",
                "boost": 1.5,
                "matched_alias": "seda",
            }
        ]
        gateway = _WindowOpenSearchGateway(retrieval_boosts=retrieval_boosts)
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        _, _, _, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra vestidos de seda",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(retrieval_request["retrieval_boosts"], retrieval_boosts)
        self.assertEqual(
            retrieval_request["opensearch_query"],
            {
                "index": "cultural_heritage_artifacts",
                "body": {"query": {"match_all": {}}},
            },
        )
        self.assertEqual(
            service._text_boosts_applied_for_log(
                router_decision={"mode": "rag"},
                retrieval_request=retrieval_request,
            ),
            {
                "in_tour_boost": settings.CHAT_IN_TOUR_BOOST,
                "retrieval_boosts": retrieval_boosts,
            },
        )

    def test_text_retrieval_applies_tour_scope_filter(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra vestidos de noiva nesta visita virtual",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra vestidos de noiva")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "vestidos noiva")
        self.assertEqual(gateway.search_page_calls[0]["filters"], {"in_tour": True})

    def test_text_retrieval_combines_temporal_and_tour_scope_filters(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteFail(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra trajes do periodo pombalino nesta visita virtual",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra trajes")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "trajes")
        self.assertEqual(gateway.search_page_calls[0]["filters"].get("in_tour"), True)
        self.assertEqual(
            gateway.search_page_calls[0]["filters"].get("_temporal_interval"),
            {
                "start_year": 1750,
                "end_year": 1777,
                "expression": "periodo pombalino",
                "confidence": 1.0,
                "include_unknown": False,
            },
        )

    def test_text_retrieval_strips_tour_scope_from_llm_rewrite_output(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteLeaksTourScope(),
            session_store=ChatSessionStore(settings),
        )

        asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query="encontra vestidos de noiva nesta visita virtual",
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], "encontra vestidos de noiva")
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "vestidos de noiva")
        self.assertEqual(gateway.search_page_calls[0]["filters"], {"in_tour": True})

    def test_text_retrieval_uses_rewrite_only_for_lexical_query(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteMuseumQuestionExamples(),
            session_store=ChatSessionStore(settings),
        )
        query = (
            "Quem são as personalidades sepultadas nos Jerónimos "
            "e porque são importantes para Portugal?"
        )

        _, _, _, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mj",
                museum_id="mj",
                query=query,
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(
            gateway.search_page_calls[0]["query_text"],
            query,
        )
        self.assertEqual(
            gateway.search_page_calls[0]["lexical_query"],
            "personalidades sepultadas nos Jerónimos",
        )
        self.assertEqual(retrieval_request["search_query"], query)
        self.assertEqual(retrieval_request["query_text"], query)

    def test_text_retrieval_keeps_original_embedding_query_for_wedding_dress_rewrite(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteWeddingDress(),
            session_store=ChatSessionStore(settings),
        )
        query = "Consegues encontrar vestidos de noiva?"

        _, _, _, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query=query,
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "vestidos de noiva")
        self.assertEqual(gateway.search_page_calls[0]["query_text"], query)
        self.assertEqual(retrieval_request["lexical_query"], "vestidos de noiva")
        self.assertEqual(retrieval_request["query_rewrite_source"], "llm")
        self.assertEqual(retrieval_request["search_query"], query)
        self.assertEqual(retrieval_request["query_text"], query)

    def test_text_retrieval_removes_visit_planning_intent_from_rewrite(self) -> None:
        settings = get_settings()
        gateway = _WindowOpenSearchGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_EmbeddingOk(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteMuseumQuestionExamples(),
            session_store=ChatSessionStore(settings),
        )
        query = (
            "Se eu tiver apenas 15 minutos para uma visita virtual, "
            "quais são os objetos que não devo perder?"
        )
        tour_scope_expression = service._extract_tour_scope_expression(query)
        original_search_query = service._strip_tour_scope_expression_from_query(
            query,
            tour_scope_expression,
        )
        if not original_search_query:
            original_search_query = "objetos"

        _, _, _, retrieval_request = asyncio.run(
            service._retrieve_context(
                museum_slug="mnt",
                museum_id="mnt",
                query=query,
                filters={},
                sort={},
                result_window_size=10,
            )
        )

        self.assertEqual(gateway.search_page_calls[0]["query_text"], original_search_query)
        self.assertEqual(gateway.search_page_calls[0]["lexical_query"], "objetos")
        self.assertEqual(gateway.search_page_calls[0]["filters"], {"in_tour": True})
        self.assertEqual(retrieval_request["query_rewrite_source"], "llm")
        self.assertEqual(retrieval_request["search_query"], original_search_query)
        self.assertEqual(retrieval_request["query_text"], original_search_query)

    def test_retrieval_query_rewrite_prompt_does_not_expose_museum_context_terms(self) -> None:
        prompt = build_retrieval_query_rewrite_prompt(
            user_query="e o tumulo de fernando pessoa",
            filters={},
            sort={},
        )

        self.assertNotIn("museum_slug", prompt)
        self.assertNotIn("museum_id", prompt)
        self.assertNotIn("mj", prompt)
        self.assertIn("personalidades sepultadas nos Jerónimos", prompt)
        self.assertIn("15 minutos", prompt)
        self.assertIn("nao devo perder", prompt)

    def test_retrieval_query_rewrite_rejects_headgear_translation(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteHeadgearLeak(),
            session_store=ChatSessionStore(settings),
        )

        lexical, embedding = asyncio.run(
            service._rewrite_retrieval_query_with_llm(
                query="Encontra chapéus",
                museum_slug="mnt",
                museum_id="mnt",
                filters={},
                sort={},
            )
        )
        self.assertEqual(lexical, "chapeus")
        self.assertEqual(embedding, "")

    def test_retrieval_query_rewrite_rejects_translation_with_only_single_letter_overlap(self) -> None:
        service = _build_service()

        self.assertTrue(
            service._has_query_language_mismatch(
                "encontra o tumulo de d sebastiao",
                "mj tomb d sebastian",
            )
        )

    def test_text_retrieval_window_uses_results_page_size_not_candidate_count(self) -> None:
        settings = get_settings()
        previous_candidates = settings.CHAT_RETRIEVAL_CANDIDATES
        previous_window = settings.CHAT_RETRIEVAL_PAGINATION_WINDOW
        gateway = _WindowOpenSearchGateway()
        try:
            settings.CHAT_RETRIEVAL_CANDIDATES = 1000
            settings.CHAT_RETRIEVAL_PAGINATION_WINDOW = 150
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
            settings.CHAT_RETRIEVAL_PAGINATION_WINDOW = previous_window

        self.assertEqual(total, 150)
        self.assertEqual(len(docs), 10)
        self.assertEqual(gateway.search_page_calls[0]["page_size"], 10)
        self.assertEqual(gateway.search_page_calls[0]["retrieval_window_size"], 150)

    def test_text_retrieval_context_includes_visible_results_page(self) -> None:
        settings = get_settings()
        previous_top_k = settings.CHAT_RETRIEVAL_TOP_K
        previous_window = settings.CHAT_RETRIEVAL_PAGINATION_WINDOW
        try:
            settings.CHAT_RETRIEVAL_TOP_K = 5
            settings.CHAT_RETRIEVAL_PAGINATION_WINDOW = 150
            service = ChatService(
                settings=settings,
                opensearch_gateway=_WindowOpenSearchGateway(),
                embedding_provider=_EmbeddingOk(),
                model_retrieval_service=_Dummy(),
                tour_navigation_service=_Dummy(),
                llm_service=_LLMRewriteFail(),
                session_store=ChatSessionStore(settings),
            )

            context, _, docs, _ = asyncio.run(
                service._retrieve_context(
                    museum_slug="mnt",
                    museum_id="mnt",
                    query="encontra o tumulo de d sebastiao",
                    filters={},
                    sort={},
                    result_window_size=10,
                )
            )
        finally:
            settings.CHAT_RETRIEVAL_TOP_K = previous_top_k
            settings.CHAT_RETRIEVAL_PAGINATION_WINDOW = previous_window

        self.assertEqual(len(docs), 10)
        self.assertIn("[doc_10]", context)
        self.assertIn("Resultado 9", context)

    def test_visible_results_context_only_includes_visible_artifact_cards(self) -> None:
        service = _build_service()
        visible_artifacts = [
            ArtifactResult(
                artifact_id="artifact_1",
                inventory_number="31711",
                title="Touca Feminina",
                description="Touca bordada.",
            ),
            ArtifactResult(
                artifact_id="artifact_2",
                inventory_number="35306",
                title="Touca Crianca",
                description="Touca infantil.",
            ),
        ]

        context = service._build_visible_results_retrieval_context(
            artifact_results=visible_artifacts,
            image_matches=[],
            page=1,
            page_size=2,
            total=5,
        )

        self.assertIn("visible_results_count: 2", context)
        self.assertIn("visible_results_total: 5", context)
        self.assertIn("current_visible_results:", context)
        self.assertIn("[doc_1]", context)
        self.assertIn("Touca Feminina", context)
        self.assertIn("[doc_2]", context)
        self.assertIn("Touca Crianca", context)
        self.assertNotIn("[doc_3]", context)

    def test_visible_results_context_uses_image_cards_when_present(self) -> None:
        service = _build_service()
        visible_artifacts = [
            ArtifactResult(
                artifact_id="artifact_1",
                inventory_number="5532",
                title="Vestido de noiva",
                description="Vestido de tafeta de seda creme.",
            ),
            ArtifactResult(
                artifact_id="artifact_2",
                inventory_number="35342",
                title="Conjunto de noiva",
                description="Conjunto de noiva com cauda.",
            ),
        ]
        visible_image_matches = [
            ImageMatchResult(
                original_image_name="5532.jpg",
                artifact_id="artifact_1",
                inventory="5532",
                title="Vestido de noiva/Feminino",
                artifact={"artifact_id": "artifact_1", "title": "Vestido de noiva"},
            ),
            ImageMatchResult(
                original_image_name="mnt_cf_30.jpg",
                artifact_id="artifact_3",
                inventory="MNT CF 30",
                title="[Retrato de Noivos]",
                artifact={"artifact_id": "artifact_3", "title": "[Retrato de Noivos]"},
            ),
            ImageMatchResult(
                original_image_name="35342.jpg",
                artifact_id="artifact_2",
                inventory="35342",
                title="Conjunto de noiva",
                artifact={"artifact_id": "artifact_2", "title": "Conjunto de noiva"},
            ),
            ImageMatchResult(
                original_image_name="mnt_cf_678.jpg",
                artifact_id="artifact_4",
                inventory="MNT CF 678",
                title="[Fotografia de Casamento]",
                artifact={"artifact_id": "artifact_4", "title": "[Fotografia de Casamento]"},
            ),
        ]

        context = service._build_visible_results_retrieval_context(
            artifact_results=visible_artifacts,
            image_matches=visible_image_matches,
            page=1,
            page_size=4,
            total=8,
        )

        current_visible_block = context.split("current_visible_results:", 1)[1].split(
            "visible_image_matches:",
            1,
        )[0]
        self.assertIn("visible_results_count: 4", context)
        self.assertIn("[doc_4]", current_visible_block)
        self.assertIn("Vestido de noiva/Feminino", current_visible_block)
        self.assertIn("[Retrato de Noivos]", current_visible_block)
        self.assertIn("[Fotografia de Casamento]", current_visible_block)
        self.assertNotIn('"artifact_id"', current_visible_block)

    def test_visible_results_context_can_prefer_artifact_cards_when_image_matches_exist(self) -> None:
        service = _build_service()
        visible_artifacts = [
            ArtifactResult(
                artifact_id="artifact_1",
                inventory_number="5532",
                title="Vestido de noiva",
                description="Vestido de tafeta de seda creme.",
            ),
            ArtifactResult(
                artifact_id="artifact_2",
                inventory_number="35342",
                title="Conjunto de noiva",
                description="Conjunto de noiva com cauda.",
            ),
        ]
        visible_image_matches = [
            ImageMatchResult(
                original_image_name="5532.jpg",
                artifact_id="artifact_1",
                inventory="5532",
                title="Vestido de noiva/Feminino",
                artifact={"artifact_id": "artifact_1", "title": "Vestido de noiva/Feminino"},
            )
        ]

        context = service._build_visible_results_retrieval_context(
            artifact_results=visible_artifacts,
            image_matches=visible_image_matches,
            page=1,
            page_size=2,
            total=2,
            prefer_artifact_results=True,
            include_image_matches_section=False,
        )

        current_visible_block = context.split("current_visible_results:", 1)[1]
        self.assertIn("visible_results_count: 2", context)
        self.assertIn("[doc_2]", current_visible_block)
        self.assertIn("Vestido de noiva", current_visible_block)
        self.assertIn("Conjunto de noiva", current_visible_block)
        self.assertNotIn("Vestido de noiva/Feminino", current_visible_block)
        self.assertNotIn("visible_image_matches:", context)

    def test_navigation_targets_cover_full_visible_result_set(self) -> None:
        settings = get_settings()
        navigation = _EchoTourNavigation()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=navigation,
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )
        docs = [
            {
                "artifact_id": f"artifact_{index}",
                "inventory_number": f"I{index}",
                "title": f"Resultado {index}",
            }
            for index in range(1, 11)
        ]

        targets = service._resolve_navigation_targets(
            museum_slug="mnt",
            museum_id="mnt",
            docs=docs,
        )

        self.assertEqual(len(targets), 10)
        self.assertEqual(navigation.calls[0]["limit"], 10)
        self.assertEqual(targets[-1].inventory_id, "I10")

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

    def test_related_artifacts_page_uses_image_order_fetch_for_thumbnails(self) -> None:
        settings = get_settings()
        gateway = _RelatedArtifactsImageGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )

        page = asyncio.run(
            service.get_related_artifacts_page(
                museum_slug="mnt",
                museum_id="mnt",
                artifact_id="artifact_current",
                tipo="conjunto",
                entity_id="conjunto:1",
                offset=0,
                limit=2,
            )
        )

        self.assertEqual(len(gateway.image_fetch_calls), 1)
        self.assertEqual(
            gateway.image_fetch_calls[0]["artifact_ids"],
            ["artifact_related_1", "artifact_related_2"],
        )
        self.assertEqual(gateway.image_fetch_calls[0]["per_artifact"], 1)
        self.assertEqual(page.artifacts[0].images[0].image_id, "artifact_related_1_ordered")
        self.assertEqual(page.artifacts[0].images[0].image_order, 1)
        self.assertEqual(page.artifacts[0].images[0].local_path, "ordered/artifact_related_1.jpg")

    def test_detail_context_related_sections_use_image_order_fetch_for_thumbnails(self) -> None:
        settings = get_settings()
        gateway = _RelatedArtifactsImageGateway()
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )

        context = asyncio.run(
            service.get_artifact_detail_context(
                museum_slug="mnt",
                museum_id="mnt",
                artifact_id="artifact_current",
            )
        )

        self.assertEqual(len(gateway.image_fetch_calls), 1)
        self.assertEqual(
            gateway.image_fetch_calls[0]["artifact_ids"],
            ["artifact_related_1", "artifact_related_2", "artifact_exhibition_1"],
        )
        self.assertEqual(
            context.sets[0].artifacts[0].images[0].local_path,
            "ordered/artifact_related_1.jpg",
        )
        self.assertEqual(
            context.exhibitions[0].artifacts[0].images[0].local_path,
            "ordered/artifact_exhibition_1.jpg",
        )

    def test_detail_context_fetches_author_details_from_author_index_by_id(self) -> None:
        settings = get_settings()
        gateway = _AuthorDetailGateway(with_creator_ids=True)
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )

        context = asyncio.run(
            service.get_artifact_detail_context(
                museum_slug="mnt",
                museum_id="mnt",
                artifact_id="artifact_author",
            )
        )

        self.assertEqual(context.authors[0].atividade, "Escritor")
        self.assertEqual(context.authors[0].biografia, "Biografia enriquecida do indice de autores.")
        self.assertEqual(context.authors[0].entity_id, "59837")
        self.assertEqual(gateway.author_id_fetch_calls[0]["author_ids"], ["59837"])
        self.assertFalse([call for call in gateway.entity_fetch_calls if call.get("tipo") == "autor"])

    def test_detail_context_does_not_fetch_author_details_by_name_without_ids(self) -> None:
        settings = get_settings()
        gateway = _AuthorDetailGateway(with_creator_ids=False)
        service = ChatService(
            settings=settings,
            opensearch_gateway=gateway,
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_NoTourNavigation(),
            llm_service=_Dummy(),
            session_store=ChatSessionStore(settings),
        )

        context = asyncio.run(
            service.get_artifact_detail_context(
                museum_slug="mnt",
                museum_id="mnt",
                artifact_id="artifact_author",
            )
        )

        self.assertEqual(context.authors, [])
        self.assertEqual(gateway.author_id_fetch_calls, [])
        self.assertEqual(gateway.author_name_fetch_calls, [])

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

    def test_paginate_results_keeps_all_artifacts_when_image_matches_are_fewer(self) -> None:
        service = _build_service()
        state = _state_with_history()
        artifacts = [
            ArtifactResult(artifact_id=f"a{index}", inventory_number=f"I{index}")
            for index in range(1, 6)
        ]
        image_matches = [
            ImageMatchResult(
                original_image_name="img_1.jpg",
                artifact_id="a1",
                inventory="I1",
            )
        ]

        (
            paged_artifacts,
            paged_image_matches,
            _paged_navigation_targets,
            results_page,
            results_page_size,
            results_total,
            results_has_more,
        ) = service._build_paged_results(
            state=state,
            artifact_results=artifacts,
            image_matches=image_matches,
            navigation_targets=[],
            page=1,
            page_size=5,
            default_page_size=5,
        )

        self.assertEqual(results_page, 1)
        self.assertEqual(results_page_size, 5)
        self.assertEqual(results_total, 5)
        self.assertFalse(results_has_more)
        self.assertEqual(
            [item.artifact_id for item in paged_artifacts],
            ["a1", "a2", "a3", "a4", "a5"],
        )
        self.assertEqual([item.artifact_id for item in paged_image_matches], ["a1"])

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
        self.assertEqual(len(gateway.image_fetch_calls), 2)

    def test_get_results_page_uses_requested_results_request_id(self) -> None:
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
        state = ChatSessionState(conversation_id="conv_two_pages", museum_slug="mnt")
        old_request = {
            "kind": "text",
            "museum_id": "mnt",
            "query_text": "pesquisa antiga",
            "lexical_query": "pesquisa antiga",
            "query_embedding": [0.1],
            "filters": {},
            "sort": {},
            "results_total": 12,
            "results_request_id": "old-page",
        }
        new_request = {
            "kind": "text",
            "museum_id": "mnt",
            "query_text": "pesquisa nova",
            "lexical_query": "pesquisa nova",
            "query_embedding": [0.2],
            "filters": {},
            "sort": {},
            "results_total": 12,
            "results_request_id": "new-page",
        }
        state.last_paged_results_default_page_size = 2
        state.last_paged_retrieval_request = new_request
        state.paged_results_by_request_id = {
            "old-page": {
                "artifact_results": [],
                "image_matches": [],
                "navigation_targets": [],
                "default_page_size": 2,
                "retrieval_request": old_request,
            },
            "new-page": {
                "artifact_results": [],
                "image_matches": [],
                "navigation_targets": [],
                "default_page_size": 2,
                "retrieval_request": new_request,
            },
        }
        session_store.save(state)

        response = asyncio.run(
            service.get_results_page(
                ChatResultsPageRequest(
                    museum_slug="mnt",
                    museum_id="mnt",
                    conversation_id="conv_two_pages",
                    results_page=2,
                    results_page_size=2,
                    results_request_id="old-page",
                )
            )
        )

        self.assertEqual(response.results_request_id, "old-page")
        self.assertEqual(len(gateway.search_page_calls), 1)
        self.assertEqual(gateway.search_page_calls[0]["query_text"], "pesquisa antiga")

    def test_get_results_page_does_not_fallback_when_requested_id_is_missing(self) -> None:
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
        state = ChatSessionState(conversation_id="conv_missing_page", museum_slug="mnt")
        state.last_paged_results_default_page_size = 2
        state.last_paged_retrieval_request = {
            "kind": "text",
            "museum_id": "mnt",
            "query_text": "pesquisa nova",
            "lexical_query": "pesquisa nova",
            "query_embedding": [0.2],
            "filters": {},
            "sort": {},
            "results_total": 12,
            "results_request_id": "new-page",
        }
        session_store.save(state)

        response = asyncio.run(
            service.get_results_page(
                ChatResultsPageRequest(
                    museum_slug="mnt",
                    museum_id="mnt",
                    conversation_id="conv_missing_page",
                    results_page=2,
                    results_page_size=2,
                    results_request_id="missing-page",
                )
            )
        )

        self.assertEqual(response.results_request_id, "missing-page")
        self.assertEqual(response.artifact_results, [])
        self.assertFalse(response.results_has_more)
        self.assertEqual(gateway.search_page_calls, [])

if __name__ == "__main__":
    unittest.main()
