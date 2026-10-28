"""Stdlib-only runner regressions, also run in CI's Python version matrix."""
import sys

import pytest

from app.services.structural_runner import analyze_structure


def test_analysis_never_executes_source():
    facts = analyze_structure('raise RuntimeError("must never run")\nwhile True: pass\n')
    assert facts["syntax_valid"] and facts["uses_while"]


def test_complete_ast_facts_and_dotted_call():
    facts = analyze_structure('''
class Example:
    async def method(self):
        async for value in values:
            if value:
                math.sqrt(value)
def function():
    while False:
        print("ignored")
''')
    assert facts == dict(syntax_valid=True, functions=["function", "method"], classes=["Example"],
                         calls=["math.sqrt", "print"], uses_for=True, uses_while=True, uses_if=True)


def test_comments_strings_and_invalid_syntax():
    facts = analyze_structure('# def fake(): pass\n"for x in y: print(x)"\n')
    assert not facts["functions"] and not facts["uses_for"] and not facts["calls"]
    assert analyze_structure("def broken(:")["syntax_valid"] is False


def test_python_314_template_string_grammar_without_evaluating_interpolation():
    # t-strings were introduced in 3.14. Neither the undefined name nor the
    # function call inside the interpolation may be evaluated by this analyzer.
    source = 'def render():\n    return t"Hello {undefined_name()}"\n'
    facts = analyze_structure(source)
    if sys.version_info >= (3, 14):
        assert facts["syntax_valid"]
        assert facts["functions"] == ["render"]
        assert facts["calls"] == ["undefined_name"]
    else:
        assert facts["syntax_valid"] is False
