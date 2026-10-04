"""SQLite WAL storage. All read/modify/write decisions are atomic transactions."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3

class Database:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
            version = conn.execute('SELECT COALESCE(MAX(version),0) FROM schema_migrations').fetchone()[0]
            if version > 1:
                raise RuntimeError('Database schema is newer than this application; do not downgrade')
            if version < 1:
                migration = (Path(__file__).resolve().parents[1] / 'migrations/001_initial.sql').read_text()
                conn.executescript('BEGIN IMMEDIATE;\n' + migration + '\nINSERT INTO schema_migrations(version) VALUES (1);\nCOMMIT;')

    @contextmanager
    def connect(self, *, write=False):
        conn = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=5000')
        try:
            if write:
                conn.execute('BEGIN IMMEDIATE')
            yield conn
            if write:
                conn.commit()
        except BaseException:
            if write:
                conn.rollback()
            raise
        finally:
            conn.close()

    def backup(self, destination: str):
        """Operator-only CLI; never exposed as an API/MCP path operation."""
        if Path(destination).exists():
            raise ValueError('Backup destination already exists')
        with self.connect() as source, sqlite3.connect(destination) as target:
            source.backup(target)
            result = target.execute('PRAGMA integrity_check').fetchone()[0]
            if result != 'ok':
                raise RuntimeError('Backup integrity check failed')
