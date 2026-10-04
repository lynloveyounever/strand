"""Build a portable source ZIP from explicit source paths, never runtime data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'strand-source.zip'
relative = [
    'package.json', 'package-lock.json', 'tsconfig.json', 'index.html', 'README.md',
    '.gitignore', '.dockerignore', 'public/favicon.svg', 'docs/implementation-guide.md',
    'scripts/package-source.py', 'scripts/build-domain.mjs',
    'backend/README.md', 'backend/Dockerfile', 'backend/compose.yaml',
    'backend/.env.example', 'backend/requirements.txt',
    'backend/requirements-dev.txt', 'backend/pytest.ini',
    'backend/domain/bridge.ts', 'backend/tests/fixtures/story.json',
]
files = [root / name for name in relative]
files += list((root / 'src').glob('*'))
files += list((root / 'backend/strand_api').glob('*.py'))
files += list((root / 'backend/tests').glob('*.py'))
files += list((root / 'backend/migrations').glob('*.sql'))

out.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        if path.is_file():
            archive.write(path, Path('strand') / path.relative_to(root))

with ZipFile(out) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert 'strand/backend/strand_api/app.py' in names
    assert 'strand/backend/.env.example' in names
    for name in names:
        path = Path(name)
        assert not any(part in {'.git', '.openai', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'data'} for part in path.parts)
        assert not path.name.endswith(('.sqlite3', '.sqlite3-wal', '.sqlite3-shm'))
        assert not (path.name.startswith('.env') and path.name != '.env.example')
        assert name != 'strand/backend/domain/bridge.mjs'
print(out)
