import io
import json
import unittest
from unittest.mock import patch

from app.services.embeddings import (
    BGEM3TextEmbedder,
    EmbeddingProvider,
    EmbeddingProviderError,
    OpenRouterBGETextEmbedder,
    QwenMultimodalImageEmbedder,
    QwenTextEmbedder,
)


class _FakeVectors:
    def __init__(self, payload):
        self._payload = payload

    def tolist(self):
        return self._payload


class _FakeSentenceTransformer:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.max_seq_length = 0
        self.encode_calls = []
        self.tokenizer = None

    def get_embedding_dimension(self):
        return 3

    def encode(self, values, **kwargs):
        self.encode_calls.append((values, kwargs))
        length = len(values)
        payload = [[float(idx + 1)] * 3 for idx in range(length)]
        return _FakeVectors(payload)


class _FakeImage:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def convert(self, mode):
        return self

    def copy(self):
        return self


class _FakeBGEM3Model:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.calls = []

    def encode(self, values, **kwargs):
        self.calls.append((values, kwargs))
        return {
            "dense_vecs": [
                [3.0, 4.0, 0.0],
                [0.0, 2.0, 0.0],
            ][: len(values)]
        }


class _FakeHTTPResponse:
    def __init__(self, payload, *, status: int = 200):
        self._payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


class EmbeddingAlignmentTests(unittest.TestCase):
    def test_text_embedder_uses_normalized_encode(self) -> None:
        with patch("app.services.embeddings._import_sentence_transformers", return_value=_FakeSentenceTransformer):
            with patch("app.services.embeddings._pick_runtime", return_value=("cpu", "dtype", "fp32")):
                embedder = QwenTextEmbedder(
                    "model-id",
                    max_length=2048,
                    prefer_bf16=True,
                    batch_size=2,
                )
                vectors = embedder.embed_documents(["a", "b"])

        self.assertEqual(vectors, [[1.0, 1.0, 1.0], [2.0, 2.0, 2.0]])
        call_values, call_kwargs = embedder.model.encode_calls[0]
        self.assertEqual(call_values, ["a", "b"])
        self.assertTrue(call_kwargs["normalize_embeddings"])
        self.assertTrue(call_kwargs["convert_to_numpy"])

    def test_multimodal_image_bytes_uses_image_only_encode(self) -> None:
        with patch("app.services.embeddings._import_sentence_transformers", return_value=_FakeSentenceTransformer):
            with patch("app.services.embeddings._pick_runtime", return_value=("cpu", "dtype", "fp32")):
                with patch("app.services.embeddings._import_pil_image") as pil_import:
                    pil_import.return_value.open.return_value = _FakeImage()
                    embedder = QwenMultimodalImageEmbedder(
                        "model-id",
                        max_length=2048,
                        prefer_bf16=True,
                        image_batch_size=2,
                    )
                    vectors = embedder.embed_many_image_bytes(
                        [b"a", b"b"],
                        text="ignored",
                    )

        self.assertEqual(vectors, [[1.0, 1.0, 1.0], [2.0, 2.0, 2.0]])
        call_values, call_kwargs = embedder.model.encode_calls[0]
        self.assertEqual(len(call_values), 2)
        self.assertTrue(call_kwargs["normalize_embeddings"])
        self.assertTrue(call_kwargs["convert_to_numpy"])

    def test_multimodal_invalid_single_image_raises(self) -> None:
        with patch("app.services.embeddings._import_sentence_transformers", return_value=_FakeSentenceTransformer):
            with patch("app.services.embeddings._pick_runtime", return_value=("cpu", "dtype", "fp32")):
                with patch("app.services.embeddings._import_pil_image") as pil_import:
                    pil_import.return_value.open.side_effect = OSError("invalid")
                    embedder = QwenMultimodalImageEmbedder(
                        "model-id",
                        max_length=2048,
                        prefer_bf16=True,
                        image_batch_size=2,
                    )
                    with self.assertRaises(EmbeddingProviderError):
                        embedder.embed_image_bytes(b"invalid")

    def test_bgem3_embedder_normalizes_dense_vectors(self) -> None:
        with patch("app.services.embeddings._import_flag_embedding", return_value=_FakeBGEM3Model):
            with patch("app.services.embeddings._import_torch", side_effect=EmbeddingProviderError("no torch")):
                embedder = BGEM3TextEmbedder(
                    "BAAI/bge-m3",
                    max_length=2048,
                    batch_size=2,
                    expected_dimension=3,
                )
                vectors = embedder.embed_documents(["a", "b"])

        self.assertEqual(len(vectors), 2)
        self.assertAlmostEqual(vectors[0][0], 0.6, places=5)
        self.assertAlmostEqual(vectors[0][1], 0.8, places=5)
        self.assertAlmostEqual(vectors[1][1], 1.0, places=5)

    def test_bgem3_embedder_dimension_mismatch_raises(self) -> None:
        with patch("app.services.embeddings._import_flag_embedding", return_value=_FakeBGEM3Model):
            with patch("app.services.embeddings._import_torch", side_effect=EmbeddingProviderError("no torch")):
                embedder = BGEM3TextEmbedder(
                    "BAAI/bge-m3",
                    max_length=2048,
                    batch_size=2,
                    expected_dimension=4,
                )
                with self.assertRaises(EmbeddingProviderError):
                    embedder.embed_documents(["a"])

    def test_provider_selects_bgem3_for_bge_model_id(self) -> None:
        settings = type(
            "SettingsStub",
            (),
            {
                "text_embedding_model_resolved": "BAAI/bge-m3",
                "multimodal_embedding_model_resolved": "Qwen/Qwen3-VL-Embedding-2B",
                "EMBEDDING_MAX_LENGTH": 2048,
                "EMBEDDING_PREFER_BF16": True,
                "TEXT_EMBEDDING_BATCH_SIZE": 2,
                "MULTIMODAL_IMAGE_EMBEDDING_BATCH_SIZE": 2,
                "ARTIFACT_TEXT_EMBEDDING_DIMENSION": 3,
                "USE_OPENROUTER_BGE_M3": False,
                "OPENROUTER_API_KEY": None,
                "openrouter_base_url_resolved": "https://openrouter.ai/api/v1",
                "openrouter_bge_model_resolved": "baai/bge-m3",
            },
        )()

        with patch("app.services.embeddings._import_flag_embedding", return_value=_FakeBGEM3Model):
            with patch("app.services.embeddings._import_torch", side_effect=EmbeddingProviderError("no torch")):
                provider = EmbeddingProvider(settings)
                embedder = provider._get_text_embedder()

        self.assertIsInstance(embedder, BGEM3TextEmbedder)

    def test_openrouter_bgem3_embedder_posts_batch_and_preserves_order(self) -> None:
        calls = []

        def _fake_urlopen(request, timeout):
            calls.append((request, timeout))
            payload = json.loads(request.data.decode("utf-8"))
            headers = {key.lower(): value for key, value in request.header_items()}

            self.assertEqual(payload["model"], "baai/bge-m3")
            self.assertEqual(payload["input"], ["a", "b"])
            self.assertEqual(headers["authorization"], "Bearer test-key")
            self.assertEqual(headers["content-type"], "application/json")

            return _FakeHTTPResponse(
                {
                    "data": [
                        {"index": 1, "embedding": [0.0, 3.0, 4.0]},
                        {"index": 0, "embedding": [3.0, 4.0, 0.0]},
                    ]
                }
            )

        with patch("app.services.embeddings.urlopen", side_effect=_fake_urlopen):
            embedder = OpenRouterBGETextEmbedder(
                "baai/bge-m3",
                api_key="test-key",
                base_url="https://openrouter.ai/api/v1",
                batch_size=2,
                expected_dimension=3,
            )
            vectors = embedder.embed_documents(["a", "b"])

        self.assertEqual(len(calls), 1)
        request, timeout = calls[0]
        self.assertEqual(request.full_url, "https://openrouter.ai/api/v1/embeddings")
        self.assertEqual(timeout, 60.0)
        self.assertEqual(len(vectors), 2)
        self.assertAlmostEqual(vectors[0][0], 0.6, places=5)
        self.assertAlmostEqual(vectors[0][1], 0.8, places=5)
        self.assertAlmostEqual(vectors[1][1], 0.6, places=5)
        self.assertAlmostEqual(vectors[1][2], 0.8, places=5)

    def test_provider_openrouter_flag_without_api_key_raises(self) -> None:
        settings = type(
            "SettingsStub",
            (),
            {
                "text_embedding_model_resolved": "BAAI/bge-m3",
                "multimodal_embedding_model_resolved": "Qwen/Qwen3-VL-Embedding-2B",
                "EMBEDDING_MAX_LENGTH": 2048,
                "EMBEDDING_PREFER_BF16": True,
                "TEXT_EMBEDDING_BATCH_SIZE": 2,
                "MULTIMODAL_IMAGE_EMBEDDING_BATCH_SIZE": 2,
                "ARTIFACT_TEXT_EMBEDDING_DIMENSION": 3,
                "USE_OPENROUTER_BGE_M3": True,
                "OPENROUTER_API_KEY": "",
                "openrouter_base_url_resolved": "https://openrouter.ai/api/v1",
                "openrouter_bge_model_resolved": "baai/bge-m3",
            },
        )()

        provider = EmbeddingProvider(settings)
        with self.assertRaises(EmbeddingProviderError) as ctx:
            provider._get_text_embedder()

        self.assertIn("OPENROUTER_API_KEY", str(ctx.exception))

    def test_provider_selects_openrouter_bgem3_when_flag_enabled(self) -> None:
        settings = type(
            "SettingsStub",
            (),
            {
                "text_embedding_model_resolved": "BAAI/bge-m3",
                "multimodal_embedding_model_resolved": "Qwen/Qwen3-VL-Embedding-2B",
                "EMBEDDING_MAX_LENGTH": 2048,
                "EMBEDDING_PREFER_BF16": True,
                "TEXT_EMBEDDING_BATCH_SIZE": 2,
                "MULTIMODAL_IMAGE_EMBEDDING_BATCH_SIZE": 2,
                "ARTIFACT_TEXT_EMBEDDING_DIMENSION": 3,
                "USE_OPENROUTER_BGE_M3": True,
                "OPENROUTER_API_KEY": "test-key",
                "openrouter_base_url_resolved": "https://openrouter.ai/api/v1",
                "openrouter_bge_model_resolved": "baai/bge-m3",
            },
        )()

        provider = EmbeddingProvider(settings)
        embedder = provider._get_text_embedder()

        self.assertIsInstance(embedder, OpenRouterBGETextEmbedder)


if __name__ == "__main__":
    unittest.main()
