# Offline Benchmark Report

## Run
- Generated at: 2026-04-17T10:57:18.628647+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full, no_rewriting
- LLM candidate selection: enabled
- Se o selector LLM falhar, os campos `selected_*` ficam vazios e o detalhe aparece em `assistant_selection_error` no JSON/CSV.
- `Avg Final ms` corresponde à média por pedido da latência end-to-end até ao fim da execução do benchmark case.
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall Counts
| Total | Scored | Skipped | Errors | Avg Final ms |
| --- | --- | --- | --- | --- |
| 108 | 108 | 0 | 0 | 1484.0424 |

## Text Single, Image, 3D
### By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| image | 38 | 0.8947 | 0.8947 | 0.8947 | 0.7105 | 1188.5487 |
| model_3d | 14 | 0.8571 | 0.8571 | 0.8571 | 0.8571 | 3688.6077 |
| text_single | 40 | 0.3500 | 0.7500 | 0.4750 | 0.7500 | 1153.5327 |

### By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 44 | 0.6364 | 0.8636 | 0.7121 | 0.7500 | 1225.9463 |
| mnt | 48 | 0.6667 | 0.7917 | 0.7014 | 0.7500 | 1854.2714 |

### By Variant
| Variant | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7391 | 1593.1998 |
| no_rewriting | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1514.3364 |

## Text Multi
### Overall
| Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- |
| 16 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 1083.1193 |

### By Museum
| Museum | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 6 | 0.6667 | 0.4000 | 0.3820 | 0.6667 | 1039.3241 |
| mnt | 10 | 0.8000 | 0.3600 | 0.4162 | 0.6000 | 1109.3965 |

### By Variant
| Variant | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 1004.5546 |
| no_rewriting | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 1161.6841 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
