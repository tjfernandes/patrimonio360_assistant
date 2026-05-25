# Offline Benchmark Report

## Run
- Generated at: 2026-04-17T11:30:19.459485+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full, no_rewriting
- LLM candidate selection: enabled
- Se o selector LLM falhar, os campos `selected_*` ficam vazios e o detalhe aparece em `assistant_selection_error` no JSON/CSV.
- `Avg Final ms` corresponde à média por pedido da latência end-to-end até ao fim da execução do benchmark case.
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall Counts
| Total | Scored | Skipped | Errors | Avg Final ms |
| --- | --- | --- | --- | --- |
| 128 | 128 | 0 | 0 | 1415.4819 |

## Text Single, Image, 3D
### By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| image | 38 | 0.8947 | 0.8947 | 0.8947 | 0.7368 | 1206.3242 |
| model_3d | 14 | 0.8571 | 0.8571 | 0.8571 | 0.8571 | 3691.0426 |
| text_single | 40 | 0.3500 | 0.7500 | 0.4750 | 0.7500 | 1179.8449 |

### By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 44 | 0.6364 | 0.8636 | 0.7121 | 0.7727 | 1280.6322 |
| mnt | 48 | 0.6667 | 0.7917 | 0.7014 | 0.7500 | 1840.8520 |

### By Variant
| Variant | Scored | Recall@1 | Recall@5 | MRR | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1535.0564 |
| no_rewriting | 46 | 0.6522 | 0.8261 | 0.7065 | 0.7609 | 1610.7852 |

## Text Multi
### Overall
| Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- |
| 16 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 940.4319 |

### By Museum
| Museum | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 6 | 0.6667 | 0.4000 | 0.3820 | 0.6667 | 964.7854 |
| mnt | 10 | 0.8000 | 0.3600 | 0.4162 | 0.6000 | 925.8198 |

### By Variant
| Variant | Scored | Hit@5 | Precision@5 | nDCG@5 | LLM Final Selection | Avg Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| full | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 884.9999 |
| no_rewriting | 8 | 0.7500 | 0.3750 | 0.4034 | 0.6250 | 995.8639 |

## Rewriting Delta
| Case | Full top-1 | Full selected | Full Avg Final ms | No rewriting top-1 | No rewriting selected | No rewriting Avg Final ms | Delta Recall@5 | Delta MRR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | artifact_99574 | artifact_99574 | 943.3278 | artifact_99574 | artifact_99574 | 916.4419 | 0.0000 | 0.0000 |
| R02 | artifact_16859 | artifact_16859 | 921.3821 | artifact_16781 | artifact_105347 | 945.3627 | 1.0000 | 1.0000 |
| R03 | artifact_105515 | artifact_100025 | 848.6321 | artifact_159341 | artifact_100025 | 1022.1247 | 0.0000 | 0.0000 |
| R04 | artifact_33916 | artifact_159341 | 921.5599 | artifact_159341 | artifact_159341 | 1010.1412 | 0.0000 | 0.0000 |
| R05 | artifact_4760 | artifact_100012 | 2399.3668 | artifact_159345 | artifact_100012 | 899.1274 | 0.0000 | 0.3000 |
| R06 | artifact_159343 | artifact_159341 | 1901.9404 | artifact_159344 | artifact_159344 | 896.6982 | 0.0000 | 0.0500 |
| R07 | artifact_140824 | artifact_133209 | 904.6388 | artifact_140824 | artifact_133209 | 1066.0679 | 0.0000 | 0.0000 |
| R08 | artifact_133241 | artifact_133241 | 850.8085 | artifact_133241 | artifact_133241 | 857.4585 | 0.0000 | 0.0000 |
| R09 | artifact_141672 | artifact_134008 | 947.3659 | artifact_141672 | artifact_134008 | 817.2733 | 0.0000 | 0.0000 |
| R10 | artifact_133668 | artifact_137540 | 827.3921 | artifact_141205 | artifact_133519 | 1528.9525 | 0.0000 | 0.0000 |
