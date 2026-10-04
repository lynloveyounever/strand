# Strand FastAPI service

A private, **single-owner** first backend for Strand. Existing browser-local editing continues without a server. Connection never migrates, merges or automatically uploads local stories.

## What works

- FastAPI API with SQLite WAL persistence, migration tracking and restart-safe story snapshots
- Optimistic revision checks on every write; stale requests return `409 revision_conflict`
- Append-only versions, explicit restoration as a new version, consistent SQLite backups
- One bounded operation contract for owner API edits, embedded assistant suggestions and external MCP proposals
- Before/after proposal review; only the separate owner credential can accept or reject
- Official MCP Python SDK, stateless Streamable HTTP at `/mcp/`
- Optional OpenAI-compatible `POST /chat/completions` adapter, configured only on the server
- A settings panel to connect, inspect/upload/load snapshots, ask for a proposal, review external proposals, and read version history

The first operation vocabulary is deliberately small: edit story title/premise/theme, edit an existing event's concept/intent/audience effect, and reorder exactly the existing occurrences on one of Reality, Narrative or Audience. It has no arbitrary code, filesystem, network retrieval, authentication management, screenplay, camera or production tools. This is not an automatic cross-device sync service.

## Hosting boundary

The existing owner-private Strand Site remains a static React application. Sites' server deployment requires a Cloudflare Worker-compatible JavaScript entrypoint; this Python ASGI application **has not been deployed there**. Run it on a Python-capable host with durable disk, or locally. Choosing a host, billing, public exposure, model credentials and new persistent access are separate setup decisions. No live model key, external MCP connection or hosted Python server is included.

The backend uses Python 3.12 and Node 22+ at runtime. Node runs a fixed, bundled stdin/stdout domain bridge built from the exact TypeScript rules already used by the editor. This preserves the existing three-axis, role/content-track, event-reference and approval invariants rather than maintaining a subtly different Python validator. Request data cannot select commands, modules or paths. Bridge work has a 10-second timeout, a 128 MiB heap limit and four-process concurrency cap. Both runtimes must be present.

## Local setup

From the repository root:

```sh
npm ci
npm run build:domain
python3.12 -m venv backend/.venv
. backend/.venv/bin/activate
pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
```

Edit `backend/.env` privately. Set a long, unique `STRAND_OWNER_TOKEN` (at least 32 non-whitespace ASCII characters); leave `STRAND_AGENT_TOKEN` empty unless external agent access is explicitly wanted. If used, the agent token must be different. Do not paste either token into a repository, URL, chat transcript or browser storage. The app never generates or saves tokens for you. Set `STRAND_DATABASE_PATH=data/strand.sqlite3` for a local relative path rather than the Docker `/data` default in the example.

Start API and front end in separate terminals:

```sh
cd backend
. .venv/bin/activate
uvicorn strand_api.main:app --env-file .env --host 127.0.0.1 --port 8000 --no-access-log
```

```sh
npm run dev
```

Open the editor, then Project settings → Server & assistant. Connect to `http://127.0.0.1:8000` with the owner token. The token lives only in the open settings panel; closing settings disconnects and clears it. Inspect and confirm a local snapshot before uploading it. Reading a remote story never replaces local work until the separate load confirmation; loading adds a normal Undo step. Server acceptance likewise never overwrites the local story.

A browser may block HTTPS-to-localhost connections depending on its local-network policy. The local HTTP Vite front end is the supported local-development pairing. For the existing HTTPS private Site, use a trusted HTTPS backend and explicitly configure that Site's exact origin.

## Docker backend

```sh
# Populate backend/.env first; the empty template fails closed.
docker compose -f backend/compose.yaml up --build -d
```

This exposes **only the API on loopback** port 8000 and stores SQLite in the `strand-data` Docker volume. Run the existing front end separately as above. Docker image execution has not been verified in the current build environment; Python/Node execution and the actual API were tested directly. The image is non-root, drops Linux capabilities and uses no-new-privileges.

For remote hosting, terminate HTTPS at a trusted reverse proxy, set exact `STRAND_ALLOWED_HOSTS` and `STRAND_ALLOWED_ORIGINS`, retain persistent storage, restrict network exposure and back up regularly. Do not use a wildcard CORS origin or forward unauthenticated requests to another story service. This initial single-owner token model is not multi-user OAuth/SSO. All holders of the owner token can review/apply; give Hermes or another external agent only the separately configured **agent** credential. Rotating tokens is an operator action.

## Optional model provider

Set all three server environment values together:

- `STRAND_PROVIDER_BASE_URL`: trusted HTTPS API prefix, such as a provider's `/v1` base
- `STRAND_PROVIDER_MODEL`: a model supporting JSON-object Chat Completions
- `STRAND_PROVIDER_API_KEY`: server secret

Never use a `VITE_*` variable for credentials. Startup makes no provider call. The owner must explicitly request a proposal; that action sends the selected remote story and prompt to the configured provider. The UI states this before the request. Compatibility means the implemented Chat Completions shape, not a claim that every provider/model works. No live provider was exercised in this implementation.

Each request is bounded (45 seconds, 2,048 output tokens, at most two concurrent calls), with no automatic retry and no partial token stream shown or applied. A browser disconnect cancels waiting/provider work when observed; a provider can still charge for work already received. If cancellation races with completion, a pending proposal may already exist. Refresh proposals before retrying. Provider errors never echo its body, URL or key. Invalid, truncated, tool-calling or out-of-schema responses are rejected. Only a complete validated proposal is stored. Model content and imported story text never grant approval.

## MCP connection

Use the official Streamable HTTP endpoint `https://<your-approved-server>/mcp/` with `Authorization: Bearer <agent-token>` in an external client's secure credential configuration. Do not put the token in the URL or use the owner token for an agent. This does not create or install a Sites plugin; the Python service is a separate deployment. This initial implementation does not offer an OAuth discovery/login flow. Hermes compatibility is expected only if that client supports Streamable HTTP plus a configured Authorization header; it has not been verified against a live Hermes installation.

Tools:

1. `list_stories` lists this deployment owner's stories
2. `read_story(project_id)` returns the current revision and full story
3. `propose_story_changes(project_id, base_revision, operations, summary)` creates a pending, validated proposal

No apply/approve/reject/delete/restore tools exist. MCP authenticates both the HTTP boundary and every tool call. Direct invocation does not bypass ownership, domain validation or revision checks. Use the Strand owner UI to approve or reject.

## API and review flow

Interactive API documentation is at `/docs` and the schema at `/openapi.json`; these are protected by the same Bearer boundary, so use an authorized API client rather than an unauthenticated browser tab. Public `/healthz` only returns liveness, not authentication or database readiness.

- `GET /api/config`, `GET /api/operations/schema`
- `GET/POST /api/projects`
- `GET/PUT /api/projects/{id}` (PUT is a reviewed full snapshot, not an implicit merge)
- `POST /api/projects/{id}/operations` (owner only)
- `GET/POST /api/projects/{id}/proposals`
- `POST /api/projects/{id}/proposals/{proposal_id}/accept` (owner + base revision)
- `POST /api/projects/{id}/proposals/{proposal_id}/reject` (owner)
- `POST /api/projects/{id}/assistant` (owner)
- `GET /api/projects/{id}/history`
- `POST /api/projects/{id}/restore` with `base_revision` and `target_revision` (owner; retains later history)

All changes are atomic. A stale proposal is not silently rebased: refresh, inspect changes and request a new proposal. Re-acceptance or competing approvals cannot double-apply. Failed validation creates no partial story update. Import preserves all schema-v2 fields; existing schema-v1 input uses the editor's already-supported migration. No deletions or pruning endpoints exist in this first slice.

Limits: 8 MB request/project bridge payload, 100 projects per owner, 100 pending proposals per project, 20 operations per proposal; MCP request bodies are capped at 512 KiB. Listings return at most 100 records; pending proposals are always prioritized so they cannot be hidden behind reviewed history. Version history displays the newest 100 summaries; full stored history remains retained and a known revision can be restored via the owner API. Large-scale pagination, quotas, team permissions and automatic synchronization are future work.

## Backups and recovery

With the backend environment active:

```sh
cd backend
python -m strand_api.backup data/strand.sqlite3 backups/strand-2026-10-03.sqlite3
```

Create the destination directory first. The command uses SQLite's online backup API, checks integrity and refuses to overwrite an existing backup. Backups contain full private stories/proposals/history; protect them like the primary database. Do not copy a live WAL database file by itself. For restoration, stop the API, retain a backup of the current database, and replace the database from an integrity-checked backup using an operator-controlled path; then restart. Do not delete Docker volumes when merely restarting.

Migration `001_initial.sql` is applied once through `schema_migrations`. Startup rejects a database from a newer schema instead of downgrading it. Future migrations must be additive/transactional and preceded by a verified backup.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run build:domain
. backend/.venv/bin/activate
cd backend
python -m pytest -q
```

Tests use synthetic stories, fake provider transports and temporary databases. They exercise real FastAPI HTTP routes, persisted restart/backup, concurrent writers, restore/history, proposal validation/rejection/acceptance, owner/agent separation, no-auth fail-closed behavior, wrong-origin/host rejection, cancellation, provider failures, and the official MCP client against the actual ASGI application. No paid model call or external account setup is needed.
