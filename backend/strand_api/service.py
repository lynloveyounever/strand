import asyncio
from datetime import datetime, timezone
import json
import uuid
from pydantic import ValidationError
from .auth import Principal, require_owner
from .domain import Domain
from .errors import ServiceError
from .models import operation_adapter
from .storage import Database


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def changes(before, after, path=''):
    """JSON Pointer-like paths and complete before/after values, no prose claims."""
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        result = []
        for key in sorted(before.keys() | after.keys()):
            pointer = path + '/' + str(key).replace('~', '~0').replace('/', '~1')
            if key not in before or key not in after:
                result.append({'path': pointer, 'before': before.get(key), 'after': after.get(key)})
            else:
                result.extend(changes(before[key], after[key], pointer))
        return result
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [change for i, (a, b) in enumerate(zip(before, after)) for change in changes(a, b, path + '/' + str(i))]
    return [{'path': path or '/', 'before': before, 'after': after}]


class StoryService:
    def __init__(self, database: Database, domain=None, provider=None):
        self.db, self.domain, self.provider = database, domain or Domain(), provider
        self._assistant_slots = asyncio.Semaphore(2)

    def _project(self, conn, principal, project_id):
        row = conn.execute('SELECT * FROM projects WHERE id=? AND owner_id=?', (project_id, principal.owner_id)).fetchone()
        if not row:
            raise ServiceError('not_found', 'Story not found', 404)
        return row

    @staticmethod
    def _record(row):
        return {'id': row['id'], 'revision': row['revision'], 'project': json.loads(row['project_json']), 'updated_at': row['updated_at']}

    @staticmethod
    def _revision(row, expected):
        if row['revision'] != expected:
            raise ServiceError('revision_conflict', 'The server story changed. Refresh and review before trying again.', 409, current_revision=row['revision'])

    @staticmethod
    def _proposal(row):
        return {**{key: row[key] for key in ('id', 'project_id', 'base_revision', 'status', 'summary', 'created_at', 'source', 'decided_at', 'applied_revision')}, 'operations': json.loads(row['operations_json']), 'changes': json.loads(row['changes_json'])}

    @staticmethod
    def _save(conn, row, project, source, summary):
        revision, at, data = row['revision'] + 1, now(), encode(project)
        conn.execute('UPDATE projects SET revision=?,project_json=?,updated_at=? WHERE id=?', (revision, data, at, row['id']))
        conn.execute('INSERT INTO versions VALUES (?,?,?,?,?,?)', (row['id'], revision, data, at, source, summary))
        return {'id': row['id'], 'revision': revision, 'project': project, 'updated_at': at}

    async def list_projects(self, principal):
        with self.db.connect() as conn:
            rows = conn.execute('SELECT id,revision,project_json,updated_at FROM projects WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100', (principal.owner_id,)).fetchall()
            return {'projects': [{'id': row['id'], 'revision': row['revision'], 'title': json.loads(row['project_json'])['title'], 'updated_at': row['updated_at']} for row in rows]}

    async def get_project(self, principal, project_id):
        with self.db.connect() as conn:
            return self._record(self._project(conn, principal, project_id))

    async def create_project(self, principal, project):
        require_owner(principal)
        validated = await self.domain.validate(project)
        project_id, at, data = str(uuid.uuid4()), now(), encode(validated)
        with self.db.connect(write=True) as conn:
            if conn.execute('SELECT COUNT(*) FROM projects WHERE owner_id=?', (principal.owner_id,)).fetchone()[0] >= 100:
                raise ServiceError('project_limit', 'This deployment supports up to 100 stories', 409)
            conn.execute('INSERT INTO projects VALUES (?,?,?,?,?)', (project_id, principal.owner_id, 1, data, at))
            conn.execute('INSERT INTO versions VALUES (?,?,?,?,?,?)', (project_id, 1, data, at, 'owner_import', 'Owner explicitly imported a local story'))
        return {'id': project_id, 'revision': 1, 'project': validated, 'updated_at': at}

    async def replace_project(self, principal, project_id, base_revision, project):
        require_owner(principal)
        existing = await self.get_project(principal, project_id)
        self._revision(existing, base_revision)
        validated = await self.domain.validate(project)
        with self.db.connect(write=True) as conn:
            row = self._project(conn, principal, project_id)
            self._revision(row, base_revision)
            return self._save(conn, row, validated, 'owner_snapshot', 'Owner explicitly saved a local snapshot')

    async def apply_operations(self, principal, project_id, base_revision, operations, summary):
        require_owner(principal)
        existing = await self.get_project(principal, project_id)
        self._revision(existing, base_revision)
        operations = self._validated_operations(operations)
        candidate = await self.domain.apply(existing['project'], operations)
        with self.db.connect(write=True) as conn:
            row = self._project(conn, principal, project_id)
            self._revision(row, base_revision)
            return self._save(conn, row, candidate, 'owner_operation', summary)

    @staticmethod
    def _validated_operations(operations):
        try:
            return [op.model_dump(exclude_unset=True) for op in operation_adapter.validate_python(operations)]
        except ValidationError:
            raise ServiceError('invalid_operations', 'Use only the bounded story operation schema', 422) from None

    async def create_proposal(self, principal, project_id, base_revision, operations, summary, source='mcp'):
        existing = await self.get_project(principal, project_id)
        self._revision(existing, base_revision)
        if not isinstance(summary, str) or not 1 <= len(summary) <= 2000:
            raise ServiceError('invalid_summary', 'Proposal summary must contain 1–2000 characters', 422)
        if source not in ('mcp', 'assistant', 'agent', 'owner_proposal'):
            raise ServiceError('invalid_source', 'Unknown proposal source', 422)
        operations = self._validated_operations(operations)
        candidate = await self.domain.apply(existing['project'], operations)
        diff = changes(existing['project'], candidate)
        if not diff:
            raise ServiceError('no_changes', 'This proposal would not change the story', 422)
        proposal_id, at = str(uuid.uuid4()), now()
        with self.db.connect(write=True) as conn:
            row = self._project(conn, principal, project_id)
            self._revision(row, base_revision)
            pending = conn.execute("SELECT COUNT(*) FROM proposals WHERE project_id=? AND status='pending'", (project_id,)).fetchone()[0]
            if pending >= 100:
                raise ServiceError('proposal_limit', 'Review or reject pending proposals before adding more', 409)
            conn.execute('INSERT INTO proposals VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (proposal_id, project_id, base_revision, 'pending', summary, encode(operations), encode(diff), encode(candidate), at, source, None, None))
            result = conn.execute('SELECT * FROM proposals WHERE id=?', (proposal_id,)).fetchone()
            return self._proposal(result)

    async def list_proposals(self, principal, project_id):
        with self.db.connect() as conn:
            self._project(conn, principal, project_id)
            return {'proposals': [self._proposal(row) for row in conn.execute("SELECT * FROM proposals WHERE project_id=? ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 100", (project_id,))]}

    async def decide_proposal(self, principal, project_id, proposal_id, *, accept, base_revision=None):
        require_owner(principal)
        with self.db.connect() as conn:
            self._project(conn, principal, project_id)
            preview = conn.execute('SELECT * FROM proposals WHERE id=? AND project_id=?', (proposal_id, project_id)).fetchone()
            if not preview:
                raise ServiceError('not_found', 'Proposal not found', 404)
            if preview['status'] != 'pending':
                raise ServiceError('already_decided', 'This proposal has already been reviewed', 409)
            candidate = json.loads(preview['candidate_json'])
        if accept:
            candidate = await self.domain.validate(candidate)
        with self.db.connect(write=True) as conn:
            row = self._project(conn, principal, project_id)
            proposal = conn.execute('SELECT * FROM proposals WHERE id=? AND project_id=?', (proposal_id, project_id)).fetchone()
            if proposal['status'] != 'pending':
                raise ServiceError('already_decided', 'This proposal has already been reviewed', 409)
            record = None
            if accept:
                self._revision(row, base_revision)
                self._revision(row, proposal['base_revision'])
                record = self._save(conn, row, candidate, 'owner_accepted_' + proposal['source'], proposal['summary'])
            conn.execute('UPDATE proposals SET status=?,decided_at=?,applied_revision=? WHERE id=?', ('accepted' if accept else 'rejected', now(), record['revision'] if record else None, proposal_id))
            return record or self._proposal(conn.execute('SELECT * FROM proposals WHERE id=?', (proposal_id,)).fetchone())

    async def history(self, principal, project_id):
        with self.db.connect() as conn:
            self._project(conn, principal, project_id)
            return {'versions': [dict(row) for row in conn.execute('SELECT revision,at,source,summary FROM versions WHERE project_id=? ORDER BY revision DESC LIMIT 100', (project_id,))]}

    async def restore(self, principal, project_id, base_revision, target_revision):
        require_owner(principal)
        with self.db.connect() as conn:
            self._revision(self._project(conn, principal, project_id), base_revision)
            old = conn.execute('SELECT project_json FROM versions WHERE project_id=? AND revision=?', (project_id, target_revision)).fetchone()
            if not old:
                raise ServiceError('not_found', 'Story version not found', 404)
        project = await self.domain.validate(json.loads(old['project_json']))
        with self.db.connect(write=True) as conn:
            row = self._project(conn, principal, project_id)
            self._revision(row, base_revision)
            return self._save(conn, row, project, 'owner_restore', f'Owner restored version {target_revision}; later history is retained')

    async def assistant(self, principal, project_id, base_revision, prompt):
        require_owner(principal)
        existing = await self.get_project(principal, project_id)
        self._revision(existing, base_revision)
        if self.provider is None:
            raise ServiceError('provider_not_configured', 'A server-side model provider must be configured before using the assistant', 503)
        if self._assistant_slots.locked():
            raise ServiceError('assistant_busy', 'Two assistant requests are already running; try again shortly', 429)
        async with self._assistant_slots:
            proposal = await self.provider.propose(existing['project'], prompt, operation_adapter.json_schema())
        return await self.create_proposal(principal, project_id, base_revision, proposal['operations'], proposal['summary'], source='assistant')
