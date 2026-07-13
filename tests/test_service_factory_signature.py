"""Static guard: benchmark service_factory must call constructors with valid kwargs.

The benchmark harness broke because ``service_factory.build_service_bundle``
passed ``reranker_service=`` to ``ChatService(...)``, which never accepted it.
That is invisible until the bundle is actually built (which needs GPU models),
so this test catches it statically by AST-parsing both files — no imports, no
model loading.
"""

from __future__ import annotations

import ast
from pathlib import Path
import unittest

_BACKEND_DIR = Path(__file__).resolve().parents[1]


def _func_arg_names(func: ast.FunctionDef | ast.AsyncFunctionDef) -> set[str]:
    args = func.args
    names = {a.arg for a in args.args if a.arg != "self"}
    names |= {a.arg for a in args.kwonlyargs}
    return names


def _init_param_names(module_path: Path, class_name: str) -> set[str]:
    tree = ast.parse(module_path.read_text(encoding="utf-8-sig"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == "__init__":
                    return _func_arg_names(item)
    raise AssertionError(f"{class_name}.__init__ not found in {module_path}")


def _function_param_names(module_path: Path, func_name: str) -> set[str]:
    tree = ast.parse(module_path.read_text(encoding="utf-8-sig"))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            return _func_arg_names(node)
    raise AssertionError(f"{func_name}(...) not found in {module_path}")


def _call_kwarg_names(module_path: Path, callee: str) -> set[str]:
    tree = ast.parse(module_path.read_text(encoding="utf-8-sig"))
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == callee
        ):
            return {kw.arg for kw in node.keywords if kw.arg is not None}
    raise AssertionError(f"No call to {callee}(...) found in {module_path}")


class ServiceFactorySignatureTest(unittest.TestCase):
    def test_chat_service_call_kwargs_are_accepted(self) -> None:
        accepted = _init_param_names(
            _BACKEND_DIR / "app" / "services" / "chat_service.py", "ChatService"
        )
        passed = _call_kwarg_names(
            _BACKEND_DIR / "benchmarks" / "service_factory.py", "ChatService"
        )
        unexpected = sorted(passed - accepted)
        self.assertEqual(
            unexpected,
            [],
            msg=(
                "benchmarks/service_factory.py passes kwargs to ChatService(...) "
                f"that ChatService.__init__ does not accept: {unexpected}"
            ),
        )

    def test_warmup_chat_stack_call_kwargs_are_accepted(self) -> None:
        accepted = _function_param_names(
            _BACKEND_DIR / "app" / "services" / "warmup.py", "warmup_chat_stack"
        )
        passed = _call_kwarg_names(
            _BACKEND_DIR / "benchmarks" / "service_factory.py", "warmup_chat_stack"
        )
        unexpected = sorted(passed - accepted)
        self.assertEqual(
            unexpected,
            [],
            msg=(
                "benchmarks/service_factory.py passes kwargs to warmup_chat_stack(...) "
                f"that it does not accept: {unexpected}"
            ),
        )


if __name__ == "__main__":
    unittest.main()
