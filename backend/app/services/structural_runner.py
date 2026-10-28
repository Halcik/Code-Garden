"""Standalone, stdlib-only AST analyzer submitted to the task's Judge0 language.

The student's source is data on stdin, never imported or executed. Do not add
backend imports: this file must also run unchanged under Python 3.11–3.14.
"""
import ast
import json
import sys


def analyze_structure(source):
    facts = dict(syntax_valid=True, functions=[], classes=[], calls=[],
                 uses_for=False, uses_while=False, uses_if=False)
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError, RecursionError):
        facts["syntax_valid"] = False
        return facts
    functions, classes, calls = set(), set(), set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.add(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.add(node.name)
        elif isinstance(node, ast.Call):
            parts = []
            target = node.func
            while isinstance(target, ast.Attribute):
                parts.append(target.attr)
                target = target.value
            if isinstance(target, ast.Name):
                calls.add(".".join([target.id, *reversed(parts)]))
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            facts["uses_for"] = True
        elif isinstance(node, ast.While):
            facts["uses_while"] = True
        elif isinstance(node, ast.If):
            facts["uses_if"] = True
    facts.update(functions=sorted(functions), classes=sorted(classes), calls=sorted(calls))
    return facts


if __name__ == "__main__":
    print(json.dumps(analyze_structure(sys.stdin.read())))
