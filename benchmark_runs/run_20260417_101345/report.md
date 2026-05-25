# Offline Benchmark Report

## Run
- Generated at: 2026-04-17T10:13:45.213778+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- LLM candidate selection: enabled
- Se o selector LLM falhar, os campos `selected_*` ficam vazios e o detalhe aparece em `assistant_selection_error` no JSON/CSV.
- `Avg Final ms` corresponde à média por pedido da latência end-to-end até ao fim da execução do benchmark case.
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall Counts
| Total | Scored | Skipped | Errors | Avg Final ms |
| --- | --- | --- | --- | --- |
| 54 | 54 | 0 | 0 | 1780.9831 |

## Text Single, Image, 3D
### By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| image | 19 | 0.8947 | 0.8947 | 0.8947 | 0.7368 | 1282.0372 |
| model_3d | 7 | 0.8571 | 0.8571 | 0.8571 | 0.8571 | 3963.3463 |
| text_single | 20 | 0.3500 | 0.7500 | 0.4750 | 0.7500 | 1628.4752 |

### By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 22 | 0.6364 | 0.8636 | 0.7121 | 0.7727 | 1712.8869 |
| mnt | 24 | 0.6667 | 0.7917 | 0.7014 | 0.7500 | 1957.8384 |

### By Variant
| Variant | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1840.6877 |

## Text Multi
### Overall
| Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- |
| 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 1437.6818 |

### By Museum
| Museum | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 3 | 0.6667 | 0.4000 | 0.3820 | 0.6667 | 1536.5427 |
| mnt | 5 | 0.8000 | 0.3600 | 0.4162 | 0.6000 | 1378.3652 |

### By Variant
| Variant | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 1437.6818 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
