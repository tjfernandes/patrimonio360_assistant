# Offline Benchmark Report

## Run
- Generated at: 2026-04-15T17:20:05.287573+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | nDCG@5 | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 43 | 43 | 0 | 0 | 0.4186 | 0.6279 | 0.4872 | 0.0488 | 464.0531 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| full | 43 | 0 | 0 | 0.4186 | 0.6279 | 0.4872 | 464.0531 |

## By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- |
| image | 10 | 0.9000 | 0.9000 | 0.9000 | - |
| model_3d | 7 | 0.8571 | 0.8571 | 0.8571 | - |
| text_multi | 4 | 0.0000 | 0.2500 | 0.0833 | 0.0488 |
| text_single | 22 | 0.1364 | 0.5000 | 0.2553 | - |

## By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- |
| mnaz | 16 | 0.3125 | 0.6875 | 0.4323 | 96.9921 |
| mnt | 27 | 0.4815 | 0.5926 | 0.5198 | 681.5708 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
