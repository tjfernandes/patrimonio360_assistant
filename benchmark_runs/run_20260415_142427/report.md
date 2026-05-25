# Offline Benchmark Report

## Run
- Generated at: 2026-04-15T14:24:27.252956+00:00
- Cases file: `/mnt/c/Users/tiago_-fernandes/Desktop/patrimonio360_assistant/backend/benchmarks/cases/benchmark_cases.json`
- Variants: full
- Retrieval query behavior: exact current production pipeline; the benchmark does not change OpenSearch query construction.

## Overall
| Total | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | nDCG@5 | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 48 | 32 | 16 | 0 | 0.0625 | 0.5312 | 0.2000 | 0.0619 | 575.5884 |

## By Variant
| Variant | Scored | Skipped | Errors | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| full | 32 | 16 | 0 | 0.0625 | 0.5312 | 0.2000 | 575.5884 |

## By Mode
| Mode | Scored | Recall@1 | Recall@5 | MRR | nDCG@5 |
| --- | --- | --- | --- | --- | --- |
| image | 0 | - | - | - | - |
| model_3d | 0 | - | - | - | - |
| rewriting_pair | 4 | 0.0000 | 0.2500 | 0.0833 | 0.0000 |
| text_multi | 8 | 0.0000 | 0.3750 | 0.1042 | 0.0773 |
| text_single | 20 | 0.1000 | 0.6500 | 0.2617 | - |

## By Museum
| Museum | Scored | Recall@1 | Recall@5 | MRR | Final ms |
| --- | --- | --- | --- | --- | --- |
| mnaz | 14 | 0.0000 | 0.8571 | 0.2524 | 1250.2480 |
| mnt | 18 | 0.1111 | 0.2778 | 0.1593 | 50.8531 |

## Rewriting Delta
No comparable `full` vs `no_rewriting` rewriting-pair rows were produced in this run.

## Skipped Cases
- `full` / `I01`: incomplete_case (missing_image_input)
- `full` / `I02`: incomplete_case (missing_image_input)
- `full` / `I03`: incomplete_case (missing_image_input)
- `full` / `I04`: incomplete_case (missing_image_input)
- `full` / `I05`: incomplete_case (missing_image_input)
- `full` / `I06`: incomplete_case (missing_image_input)
- `full` / `I07`: incomplete_case (missing_image_input)
- `full` / `I08`: incomplete_case (missing_image_input)
- `full` / `I09`: incomplete_case (missing_image_input)
- `full` / `I10`: incomplete_case (missing_image_input)
- `full` / `M01`: incomplete_case (missing_model_input)
- `full` / `M02`: incomplete_case (missing_model_input)
- `full` / `M03`: incomplete_case (missing_model_input)
- `full` / `M04`: incomplete_case (missing_model_input)
- `full` / `M05`: incomplete_case (missing_model_input)
- `full` / `M06`: incomplete_case (missing_model_input)
