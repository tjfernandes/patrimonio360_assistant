# Offline Benchmark Report

## Run
- Generated at: 2026-04-16T13:48:27.104504+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- Assistant selection: disabled
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | Selected Hit | Recall@5 | MRR | nDCG@5 | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 54 | 53 | 1 | 0 | 0.6604 | - | 0.8302 | 0.7123 | 0.4610 | 440.5000 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | Selected Hit | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| full | 53 | 1 | 0 | 0.6604 | - | 0.8302 | 0.7123 | 440.5000 |

## By Mode
| Mode | Scored | Recall@1 | Selected Hit | Recall@5 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- | --- |
| image | 19 | 0.8947 | - | 0.8947 | 0.8947 | - |
| model_3d | 7 | 0.8571 | - | 0.8571 | 0.8571 | - |
| text_multi | 7 | 0.7143 | - | 0.8571 | 0.7500 | 0.4610 |
| text_single | 20 | 0.3500 | - | 0.7500 | 0.4750 | - |

## By Museum
| Museum | Scored | Recall@1 | Selected Hit | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- |
| mnaz | 24 | 0.6250 | - | 0.8750 | 0.7049 | 128.9785 |
| mnt | 29 | 0.6897 | - | 0.7931 | 0.7184 | 698.3110 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.

## Skipped Cases
- `full` / `T23`: incomplete_case (missing_ground_truth)
