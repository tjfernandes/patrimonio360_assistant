import io
import unittest
from unittest.mock import patch

from app.services.embeddings import (
    BGEM3TextEmbedder,
    EmbeddingProvider,
    EmbeddingProviderError,
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
                "DEBUG_EMBEDDINGS": False,
                "EMBEDDING_MAX_LENGTH": 2048,
                "EMBEDDING_PREFER_BF16": True,
                "TEXT_EMBEDDING_BATCH_SIZE": 2,
                "MULTIMODAL_IMAGE_EMBEDDING_BATCH_SIZE": 2,
                "ARTIFACT_TEXT_EMBEDDING_DIMENSION": 3,
            },
        )()

        with patch("app.services.embeddings._log_runtime_versions_once", return_value=None):
            with patch("app.services.embeddings._import_flag_embedding", return_value=_FakeBGEM3Model):
                with patch("app.services.embeddings._import_torch", side_effect=EmbeddingProviderError("no torch")):
                    provider = EmbeddingProvider(settings)
                    embedder = provider._get_text_embedder()

        self.assertIsInstance(embedder, BGEM3TextEmbedder)


if __name__ == "__main__":
    unittest.main()
