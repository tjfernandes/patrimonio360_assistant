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
from app.prompts.query_planner_prompts import build_retrieval_query_rewrite_prompt
from app.query_planning import QueryExecutionResult, QueryPlan
from app.schemas.chat import (
    ArtifactResult,
    ChatMessageRequest,
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

    def test_structured_reply_uses_selected_english_language(self) -> None:
        service = _build_service()
        reply = service._format_structured_reply(
            plan=QueryPlan(operation="count", confidence=0.9),
            result=QueryExecutionResult(operation="count", count=3, total=3),
            language="en",
        )

        self.assertEqual(
            reply,
            "There are 3 artifacts in the collection that match the request.",
        )

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
        self.assertEqual(embedding, "")

    def test_retrieval_query_rewrite_preserves_explicit_years(self) -> None:
        settings = get_settings()
        service = ChatService(
            settings=settings,
            opensearch_gateway=_Dummy(),
            embedding_provider=_Dummy(),
            model_retrieval_service=_Dummy(),
            tour_navigation_service=_Dummy(),
            llm_service=_LLMRewriteDropsDates(),
            session_store=ChatSessionStore(settings),
        )

        lexical, embedding = asyncio.run(
            service._rewrite_retrieval_query_with_llm(
                query=(
                    "Podes gerar uma cronologia das principais transformacoes "
                    "do traje cerimonial portugues entre 1750 e 1910?"
                ),
                museum_slug="mnt",
                museum_id="mnt",
                filters={},
                sort={},
            )
        )

        self.assertEqual(
            lexical,
            "transformacoes do traje cerimonial portugues 1750 1910",
        )
        self.assertEqual(embedding, "")

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
        self.assertEqual(gateway.search_page_calls[0]["query_text"], "vestidos crianca")

    def test_text_retrieval_sends_explicit_years_to_opensearch(self) -> None:
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
            "transformacoes do traje cerimonial portugues 1750 1910",
        )
        self.assertEqual(
            gateway.search_page_calls[0]["query_text"],
            "transformacoes do traje cerimonial portugues 1750 1910",
        )

    def test_retrieval_query_rewrite_prompt_does_not_expose_museum_context_terms(self) -> None:
        prompt = build_retrieval_query_rewrite_prompt(
            user_query="e o tumulo de fernando pessoa",
            filters={},
            sort={},
        )

        self.assertNotIn("museum_slug", prompt)
        self.assertNotIn("museum_id", prompt)
        self.assertNotIn("mj", prompt)

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
