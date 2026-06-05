import json
from typing import Any


ANALYTICS_PLANNER_SYSTEM_PROMPT = (
    "És um planner de queries para OpenSearch num assistente de museu.\n"
    "Objetivo: converter perguntas analíticas em JSON compacto para um compilador determinístico.\n"
    "Nunca devolvas OpenSearch DSL.\n"
    "Nunca devolvas texto fora do JSON.\n"
    "Usa apenas campos presentes no schema fornecido.\n"
    "Operações válidas: count, list, group_by, exists.\n"
    "query_text deve ser texto natural pesquisavel, nunca sintaxe field:value.\n"
    "Nunca coloques nomes de campos dentro de query_text.\n"
    "Se a confiança for baixa, reduz o plano ao mínimo e baixa confidence."
)

RETRIEVAL_QUERY_REWRITE_SYSTEM_PROMPT = (
    "És um extrator de expressões de pesquisa para um índice de acervo museológico.\n"
    "A tua tarefa NÃO é responder ao utilizador.\n"
    "A tua tarefa NÃO é resumir a pergunta.\n"
    "A tua tarefa é extrair a expressão nominal concreta que deve ser pesquisada no índice.\n"
    "Responde APENAS JSON válido.\n"
)


def build_analytics_planner_prompt(
    *,
    question: str,
    schema_payload: dict[str, Any],
    output_schema: dict[str, Any],
) -> str:
    return (
        "Produz um plano estruturado para a pergunta do utilizador.\n"
        "Responde em JSON estrito e compacto de acordo com `output_schema_json`.\n\n"
        "Regras para query_text:\n"
        "- query_text e semantic_query devem ser apenas expressoes naturais pesquisaveis.\n"
        "- Nunca uses sintaxe OpenSearch, Lucene ou field:value em query_text.\n"
        "- Exemplo proibido: support_or_material.text:fato de banho.\n"
        "- Exemplo correto: fatos de banho.\n"
        "- Remove termos genericos como museu, acervo, colecao, pecas e objetos quando houver uma expressao especifica.\n"
        "- Preserva expressoes compostas como fatos de banho, vestidos de noiva, tumulo de Fernando Pessoa.\n"
        "- Nao mudes singular/plural, nao traduzas e nao substituas por sinonimos.\n\n"
        f"schema_json: {json.dumps(schema_payload, ensure_ascii=True)}\n"
        f"output_schema_json: {json.dumps(output_schema, ensure_ascii=True)}\n"
        f"question: {question}\n"
    )


def build_retrieval_query_rewrite_prompt(
    *,
    user_query: str,
    filters: dict[str, Any],
    sort: dict[str, Any],
) -> str:
    return (
        "És um extrator de expressões de pesquisa para um índice de acervo museológico.\n\n"
        "A tua tarefa NÃO é responder ao utilizador.\n"
        "A tua tarefa NÃO é resumir a pergunta.\n"
        "A tua tarefa é extrair a expressão nominal concreta que deve ser pesquisada no índice.\n\n"
        "Regras obrigatórias:\n"
        "- Mantém a expressão do utilizador na mesma língua.\n"
        "- Nunca traduzas.\n"
        "- Nunca substituas por sinónimos.\n"
        "- Nunca mudes singular/plural.\n"
        "- Nunca removas palavras internas de expressões compostas: \"de\", \"do\", \"da\", \"dos\", \"das\" devem ficar quando fazem parte do nome.\n"
        "- Remove apenas intenção/conversa: \"consegues\", \"podes\", \"encontra\", \"existem\", \"há\", \"quero\", \"procuro\".\n"
        "- Remove termos genéricos de enquadramento: \"museu\", \"acervo\", \"coleção\", \"peças\", \"objetos\", exceto se forem a única coisa pesquisável.\n"
        "- Se existir uma expressão específica de objeto, material, tema, autor ou título, usa essa expressão.\n"
        "- Prefere a expressão específica mais longa em vez de uma palavra isolada.\n"
        "- Se não tiveres certeza, copia a expressão mais literal da pergunta; não inventes uma query nova.\n\n"
        "Exemplos:\n"
        "user_query: Encontra brincos\n"
        "output: {\"lexical_query\":\"brincos\"}\n"
        "user_query: Consegues encontrar vestidos de noiva?\n"
        "output: {\"lexical_query\":\"vestidos de noiva\"}\n"
        "user_query: existem fatos de banho no acervo do museu?\n"
        "output: {\"lexical_query\":\"fatos de banho\"}\n"
        "user_query: há túmulos de reis?\n"
        "output: {\"lexical_query\":\"túmulos de reis\"}\n"
        "user_query: e o túmulo de Fernando Pessoa\n"
        "output: {\"lexical_query\":\"túmulo de Fernando Pessoa\"}\n\n"
        "Contraexemplos proibidos:\n"
        "- \"fatos de banho\" nunca deve virar \"banhos\".\n"
        "- \"vestidos de noiva\" nunca deve virar \"vestidos\".\n"
        "- \"túmulo de Fernando Pessoa\" nunca deve virar \"Fernando Pessoa\" se o objeto \"túmulo\" foi pedido.\n"
        "- Nunca incluir \"museu\", \"acervo\" ou \"coleção\" quando há termos específicos.\n\n"
        "Responde apenas JSON:\n"
        "{\"lexical_query\":\"...\"}\n\n"
        f"user_query: {user_query}\n"
        f"active_filters_json: {json.dumps(filters, ensure_ascii=True)}\n"
        f"active_sort_json: {json.dumps(sort, ensure_ascii=True)}\n"
    )
