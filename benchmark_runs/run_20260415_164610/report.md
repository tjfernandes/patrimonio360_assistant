# Offline Benchmark Report

## Run
- Generated at: 2026-04-15T16:46:10.705346+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | nDCG@5 | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 49 | 49 | 0 | 0 | 0.3265 | 0.6735 | 0.4306 | 0.0496 | 416.9784 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| full | 49 | 0 | 0 | 0.3265 | 0.6735 | 0.4306 | 416.9784 |

## By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- |
| image | 10 | 0.9000 | 0.9000 | 0.9000 | - |
| model_3d | 7 | 0.8571 | 0.8571 | 0.8571 | - |
| rewriting_pair | 4 | 0.0000 | 0.2500 | 0.0833 | 0.0000 |
| text_multi | 8 | 0.0000 | 0.3750 | 0.1083 | 0.0620 |
| text_single | 20 | 0.0500 | 0.7000 | 0.2450 | - |

## By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- |
| mnaz | 18 | 0.1667 | 0.8333 | 0.3630 | 83.5454 |
| mnt | 31 | 0.4194 | 0.5806 | 0.4699 | 610.5847 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.
