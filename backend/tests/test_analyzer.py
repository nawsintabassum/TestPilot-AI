from app.analyzer import analyze_source, generate_tests

def test_analyze_functions_and_branches():
    result = analyze_source("def add(a, b):\n    if a:\n        return a + b\n    return b\n")
    assert result["valid"]
    assert result["functions"][0]["name"] == "add"
    assert result["branches"] == 1

def test_invalid_source():
    result = analyze_source("def broken(:")
    assert result["valid"] is False
    assert "Syntax error" in result["error"]

def test_generate_has_review_warning():
    result = generate_tests("def hello():\n    return 'hi'\n")
    assert "review before running" in result["code"]
    assert result["tests"][0]["name"] == "test_hello_runs"
