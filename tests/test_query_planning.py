import unittest

from app.query_planning import (
    QueryPlan,
    QuerySchema,
    QuerySchemaField,
    classify_query,
    compile_query,
    execute_query,
)
from app.query_planning.models import ListSpec, TermFilter


class FakeOpenSearchClient:
    def __init__(self) -> None:
        self.last_call: tuple[str, str, dict] | None = None

    def count(self, *, index: str, body: dict) -> dict:
        self.last_call = ("count", index, body)
        return {"count": 9}

    def search(self, *, index: str, body: dict) -> dict:
        self.last_call = ("search", index, body)
        return {
            "hits": {
                "total": {"value": 2},
                "hits": [
                    {
                        "_source": {
                            "artifact_id": "artifact_1",
                            "title": "Painel Mariano",
                            "inventory": "MN.001",
                        }
                    },
                    {
                        "_source": {
                            "artifact_id": "artifact_2",
                            "title": "Virgem com Menino",
                            "inventory": "MN.002",
                        }
                    },
                ],
            }
        }


def _build_schema() -> QuerySchema:
    return QuerySchema(
        index_name="cultural_heritage_artifacts_v1",
        fields={
            "artifact_id": QuerySchemaField(type="keyword", facetable=True),
            "museum_id": QuerySchemaField(type="keyword", facetable=True),
            "title": QuerySchemaField(type="text", text=True, semantic=True),
            "description": QuerySchemaField(type="text", text=True, semantic=True),
            "full_text": QuerySchemaField(type="text", text=True, semantic=True),
            "inventory": QuerySchemaField(type="keyword", facetable=True, text=True),
            "category": QuerySchemaField(type="keyword", facetable=True, text=True),
        },
        facetable_fields=["museum_id", "category", "inventory"],
        text_fields=["full_text", "title", "description", "inventory", "category"],
        semantic_fields=["full_text", "title", "description"],
        default_filters=[TermFilter(kind="term", field="museum_id", value="mnaz")],
    )


class QueryPlanningTests(unittest.TestCase):
    def test_count_query_quantos_azulejos_cristaos(self) -> None:
        schema = _build_schema()
        question = "quantos azulejos cristãos?"

        mode = classify_query(question, schema)
        self.assertEqual(mode, "structured")

        plan = QueryPlan(
            operation="count",
            confidence=0.92,
            query_text="azulejos cristãos",
        )
        dsl = compile_query(plan, schema)
        self.assertEqual(dsl.endpoint, "_count")
        self.assertIn("query", dsl.body)

        result = execute_query(plan, dsl, FakeOpenSearchClient())
        self.assertEqual(result.count, 9)
        self.assertEqual(result.total, 9)

    def test_count_query_tematica_crista(self) -> None:
        schema = _build_schema()
        question = "quantos azulejos de temática cristã existem?"

        mode = classify_query(question, schema)
        self.assertEqual(mode, "structured")

        plan = QueryPlan(
            operation="count",
            confidence=0.9,
            query_text="temática cristã",
        )
        dsl = compile_query(plan, schema)
        self.assertEqual(dsl.endpoint, "_count")
        self.assertIn("bool", dsl.body["query"])

    def test_list_query_iconografia_mariana(self) -> None:
        schema = _build_schema()
        question = "lista artefactos sobre iconografia mariana"

        mode = classify_query(question, schema)
        self.assertEqual(mode, "structured")

        plan = QueryPlan(
            operation="list",
            confidence=0.89,
            query_text="iconografia mariana",
            list_spec=ListSpec(limit=5, fields=["artifact_id", "title", "inventory"]),
        )
        dsl = compile_query(plan, schema)
        self.assertEqual(dsl.endpoint, "_search")
        self.assertEqual(dsl.body["size"], 5)

        result = execute_query(plan, dsl, FakeOpenSearchClient())
        self.assertEqual(result.operation, "list")
        self.assertEqual(len(result.items), 2)


if __name__ == "__main__":
    unittest.main()
