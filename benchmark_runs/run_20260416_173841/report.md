# Offline Benchmark Report

## Run
- Generated at: 2026-04-16T17:38:41.922860+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- LLM candidate selection: enabled
- Se o selector LLM falhar, os campos `selected_*` ficam vazios e o detalhe aparece em `assistant_selection_error` no JSON/CSV.
- `Avg Final ms` corresponde à média por pedido da latência end-to-end até ao fim da execução do benchmark case.
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | LLM Selected Hit | Recall@5 | MRR | nDCG@5 | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 54 | 54 | 0 | 0 | 0.6481 | 0.7593 | 0.8148 | 0.6991 | 0.4034 | 1699.9684 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | LLM Selected Hit | Recall@5 | MRR | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full | 54 | 0 | 0 | 0.6481 | 0.7593 | 0.8148 | 0.6991 | 1699.9684 |

## By Mode
| Mode | Scored | Recall@1 | LLM Selected Hit | Recall@5 | MRR | nDCG@5 | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| image | 19 | 0.8947 | 0.7895 | 0.8947 | 0.8947 | - | 1389.2381 |
| model_3d | 7 | 0.8571 | 0.8571 | 0.8571 | 0.8571 | - | 3670.4549 |
| text_multi | 8 | 0.6250 | 0.6250 | 0.7500 | 0.6562 | 0.4034 | 1424.5134 |
| text_single | 20 | 0.3500 | 0.7500 | 0.7500 | 0.4750 | - | 1415.6740 |

## By Museum
| Museum | Scored | Recall@1 | LLM Selected Hit | Recall@5 | MRR | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 25 | 0.6000 | 0.8000 | 0.8400 | 0.6767 | 1424.1063 |
| mnt | 29 | 0.6897 | 0.7241 | 0.7931 | 0.7184 | 1937.7806 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
