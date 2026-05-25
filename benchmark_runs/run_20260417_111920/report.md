# Offline Benchmark Report

## Run
- Generated at: 2026-04-17T11:19:20.310517+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full, no_rewriting
- LLM candidate selection: enabled
- Se o selector LLM falhar, os campos `selected_*` ficam vazios e o detalhe aparece em `assistant_selection_error` no JSON/CSV.
- `Avg Final ms` corresponde à média por pedido da latência end-to-end até ao fim da execução do benchmark case.
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall Counts
| Total | Scored | Skipped | Errors | Avg Final ms |
| --- | --- | --- | --- | --- |
| 128 | 128 | 0 | 0 | 1266.2169 |

## Text Single, Image, 3D
### By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| image | 38 | 0.8947 | 0.8947 | 0.8947 | 0.7368 | 1096.6740 |
| model_3d | 14 | 0.8571 | 0.8571 | 0.8571 | 0.8571 | 3585.7023 |
| text_single | 40 | 0.3500 | 0.7500 | 0.4750 | 0.7500 | 1072.6572 |

### By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 44 | 0.6364 | 0.8636 | 0.7121 | 0.7727 | 1090.7317 |
| mnt | 48 | 0.6667 | 0.7917 | 0.7014 | 0.7500 | 1808.0736 |

### By Variant
| Variant | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1479.4725 |
| no_rewriting | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1450.5216 |

## Text Multi
### Overall
| Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- |
| 16 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 904.9572 |

### By Museum
| Museum | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 6 | 0.6667 | 0.4000 | 0.3820 | 0.6667 | 1108.6824 |
| mnt | 10 | 0.8000 | 0.3600 | 0.4162 | 0.6000 | 782.7221 |

### By Variant
| Variant | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 991.7525 |
| no_rewriting | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 818.1620 |

## Rewriting Delta
| Case | Full top-1 | Full selected | Full Avg Final ms | No rewriting top-1 | No rewriting selected | No rewriting Avg Final ms | Delta Recall@5 | Delta MRR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | artifact_159342 | artifact_159342 | 931.8751 | artifact_159342 | artifact_159342 | 844.6294 | 0.0000 | 0.0000 |
| R02 | artifact_159343 | artifact_159343 | 818.0473 | artifact_159343 | artifact_159343 | 858.8760 | 0.0000 | 0.0000 |
| R03 | artifact_159341 | artifact_159341 | 910.1970 | artifact_159341 | artifact_159341 | 961.2315 | 0.0000 | 0.0000 |
| R04 | artifact_99574 | artifact_99574 | 880.6541 | artifact_99574 | artifact_99574 | 794.9527 | 0.0000 | 0.0000 |
| R05 | None | None | 101.1349 | None | None | 82.8895 | 0.0000 | 0.0000 |
| R06 | artifact_99358 | artifact_99358 | 881.2585 | artifact_99358 | artifact_99358 | 880.4937 | 0.0000 | 0.0000 |
| R07 | artifact_136722 | artifact_136722 | 781.9624 | artifact_136722 | artifact_136722 | 970.3998 | 0.0000 | 0.0000 |
| R08 | None | None | 94.6520 | None | None | 84.0560 | 0.0000 | 0.0000 |
| R09 | artifact_133241 | artifact_133241 | 811.2986 | artifact_133241 | artifact_133241 | 917.3986 | 0.0000 | 0.0000 |
| R10 | None | None | 119.9557 | None | None | 90.7600 | 0.0000 | 0.0000 |
