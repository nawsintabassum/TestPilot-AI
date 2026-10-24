import ast

def analyze_source(source: str) -> dict:
    try:
        tree = ast.parse(source or "")
    except SyntaxError as exc:
        return {"valid": False, "error": f"Syntax error at line {exc.lineno}: {exc.msg}",
                "functions": [], "classes": [], "branches": 0, "loops": 0, "exceptions": 0}
    functions, classes = [], []
    branches = loops = exceptions = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append({
                "name": node.name,
                "line": node.lineno,
                "parameters": [a.arg for a in node.args.args],
                "returns_annotation": ast.unparse(node.returns) if node.returns else None,
            })
        elif isinstance(node, ast.ClassDef):
            classes.append({"name": node.name, "line": node.lineno})
        elif isinstance(node, (ast.If, ast.IfExp, ast.Match)):
            branches += 1
        elif isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            loops += 1
        elif isinstance(node, (ast.Try, ast.TryStar, ast.Raise)):
            exceptions += 1
    return {"valid": True, "functions": functions, "classes": classes,
            "branches": branches, "loops": loops, "exceptions": exceptions}

def generate_tests(source: str) -> dict:
    result = analyze_source(source)
    if not result["valid"]:
        return {"tests": [], "code": "# Fix source syntax errors before generating tests."}
    tests = []
    lines = ["# Generated suggestions: review before running.", "import pytest", ""]
    for fn in result["functions"]:
        name = fn["name"]
        if name.startswith("_"):
            continue
        params = fn["parameters"]
        if len(params) == 0:
            call = f"{name}()"
            tests.append({"name": f"test_{name}_runs", "purpose": f"Check that {name} can be called.",
                          "inputs": "No arguments", "expected": "Call completes or raises documented exception",
                          "category": "normal", "target": name,
                          "explanation": "Provides a basic smoke test for the public function."})
            lines.extend([f"def test_{name}_runs():", f"    # TODO: import {name} from your module", "    # result = " + call, "    # assert result == expected_value", "    pytest.skip('Add the correct module import and expected behavior')", ""])
        else:
            sample = ", ".join(f"{p}=None" for p in params)
            tests.append({"name": f"test_{name}_boundary_review", "purpose": f"Review boundary behavior for {name}.",
                          "inputs": f"Parameters: {', '.join(params)}; try empty, minimum, maximum, and invalid values",
                          "expected": "Define behavior from the function contract",
                          "category": "boundary", "target": name,
                          "explanation": "Boundary behavior depends on the documented contract; choose concrete values before asserting."})
            lines.extend([f"def test_{name}_boundary_review():", f"    # TODO: import {name} from your module",
                          f"    # Example parameter names: {sample}", "    pytest.skip('Choose contract-specific boundary inputs and assertions')", ""])
    if not tests:
        lines.extend(["def test_replace_with_real_assertions():", "    pytest.skip('No public functions found; add tests for the module behavior')", ""])
    return {"tests": tests, "code": "\n".join(lines), "analysis": result}
