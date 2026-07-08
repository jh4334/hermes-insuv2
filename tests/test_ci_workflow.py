from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_push_pr_ci_runs_python_and_frontend_checks():
    workflow = REPO_ROOT / '.github/workflows/ci.yml'
    assert workflow.exists(), 'push/PR CI workflow is missing'
    text = workflow.read_text(encoding='utf-8')

    assert 'pull_request:' in text
    assert 'push:' in text
    assert 'python -m pytest -q' in text
    assert 'python -m compileall' in text
    assert 'npm ci' in text
    assert 'npm test -- --run' in text
    assert 'npm run build' in text
