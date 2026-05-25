# Offline Benchmark Report

## Run
- Generated at: 2026-04-16T13:50:35.235932+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- Assistant selection: disabled
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | Selected Hit | Recall@5 | MRR | nDCG@5 | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 54 | 54 | 0 | 0 | 0.6481 | - | 0.8148 | 0.6991 | 0.4034 | 392.9140 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | Selected Hit | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full | 54 | 0 | 0 | 0.6481 | - | 0.8148 | 0.6991 | 392.9140 |

## By Mode
| Mode | Scored | Recall@1 | Selected Hit | Recall@5 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- | --- |
| image | 19 | 0.8947 | - | 0.8947 | 0.8947 | - |
| model_3d | 7 | 0.8571 | - | 0.8571 | 0.8571 | - |
| text_multi | 8 | 0.6250 | - | 0.7500 | 0.6562 | 0.4034 |
| text_single | 20 | 0.3500 | - | 0.7500 | 0.4750 | - |

## By Museum
| Museum | Scored | Recall@1 | Selected Hit | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 25 | 0.6000 | - | 0.8400 | 0.6767 | 101.8529 |
| mnt | 29 | 0.6897 | - | 0.7931 | 0.7184 | 643.8288 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
