from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import asyncio
import os
from pathlib import Path
import sqlite3
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .auth import Authenticator, require_owner
from .errors import ServiceError
from .models import AssistantRequest, CreateProject, OperationsRequest, ReplaceProject, RestoreRequest, RevisionRequest, operation_adapter
from .storage import Database
from .service import StoryService

@dataclass
class Settings:
    database_path: str = field(default_factory=lambda: str(Path(__file__).resolve().parents[1] / 'data/strand.sqlite3'))
    owner_token: str = ''
    agent_token: str = ''
    allowed_origins: tuple[str, ...] = ('http://127.0.0.1:5173', 'http://localhost:5173')
    allowed_hosts: tuple[str, ...] = ('127.0.0.1', 'localhost', 'testserver')
    provider_url: str = ''
    provider_model: str = ''
    provider_key: str = ''

    @classmethod
    def from_env(cls):
        defaults = cls()
        return cls(database_path=os.getenv('STRAND_DATABASE_PATH', defaults.database_path), owner_token=os.getenv('STRAND_OWNER_TOKEN', ''), agent_token=os.getenv('STRAND_AGENT_TOKEN', ''), allowed_origins=tuple(x.strip() for x in os.getenv('STRAND_ALLOWED_ORIGINS', ','.join(defaults.allowed_origins)).split(',') if x.strip()), allowed_hosts=tuple(x.strip() for x in os.getenv('STRAND_ALLOWED_HOSTS', ','.join(defaults.allowed_hosts)).split(',') if x.strip()), provider_url=os.getenv('STRAND_PROVIDER_BASE_URL', ''), provider_model=os.getenv('STRAND_PROVIDER_MODEL', ''), provider_key=os.getenv('STRAND_PROVIDER_API_KEY', ''))

class BoundaryMiddleware:
    """Auth before API or MCP protocol handling; size and Origin limits apply
    even when a client forges Content-Length. Tokens never enter URLs/cookies.
    """
    def __init__(self, app, authenticate, allowed_origins):
        self.app, self.authenticate, self.origins = app, authenticate, allowed_origins

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path = scope['path']
        if path == '/healthz' or scope['method'] == 'OPTIONS':
            return await self.app(scope, receive, send)
        headers = {key.decode('latin-1').lower(): value.decode('latin-1') for key, value in scope['headers']}
        try:
            origin = headers.get('origin')
            if origin and origin not in self.origins:
                raise ServiceError('origin_forbidden', 'This browser origin is not allowed by this server', 403)
            principal = self.authenticate(headers.get('authorization'))
            scope.setdefault('state', {})['principal'] = principal
            if scope['method'] in ('POST', 'PUT', 'PATCH'):
                content_type = headers.get('content-type', '').split(';')[0].strip().lower()
                if content_type != 'application/json':
                    raise ServiceError('content_type', 'Send application/json', 415)
                body = bytearray()
                while True:
                    message = await receive()
                    if message['type'] == 'http.disconnect':
                        return
                    body.extend(message.get('body', b''))
                    if len(body) > 8_000_000:
                        raise ServiceError('too_large', 'Request exceeds the 8 MB limit', 413)
                    if not message.get('more_body'):
                        break
                used = False
                async def buffered_receive():
                    nonlocal used
                    if not used:
                        used = True
                        return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                    return await receive()
                return await self.app(scope, buffered_receive, send)
            return await self.app(scope, receive, send)
        except ServiceError as error:
            await JSONResponse({'detail': error.detail()}, status_code=error.status)(scope, receive, send)


def create_app(settings=None, *, service=None, provider=None):
    settings = settings or Settings.from_env()
    auth = Authenticator(settings.owner_token, settings.agent_token)
    if provider is None and any((settings.provider_url, settings.provider_key, settings.provider_model)):
        from .provider import OpenAICompatibleProvider, ProviderConfig
        provider = OpenAICompatibleProvider(ProviderConfig(base_url=settings.provider_url, model=settings.provider_model, api_key=settings.provider_key))
    service = service or StoryService(Database(settings.database_path), provider=provider)
    from .mcp_server import create_mcp
    mcp = create_mcp(service, auth, allowed_hosts=[pattern for host in settings.allowed_hosts for pattern in (host, host + ':*')], allowed_origins=list(settings.allowed_origins))
    mcp_app = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(app):
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title='Strand private story API', version='0.1.0', lifespan=lifespan)
    app.state.service, app.state.authenticate, app.state.mcp = service, auth, mcp

    @app.exception_handler(ServiceError)
    async def service_error(request, error):
        return JSONResponse({'detail': error.detail()}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse({'detail': {'code': 'invalid_request', 'message': 'Request does not match the typed API schema'}}, status_code=422)

    @app.exception_handler(sqlite3.OperationalError)
    async def database_error(request, error):
        return JSONResponse({'detail': {'code': 'storage_unavailable', 'message': 'Storage is temporarily unavailable. Retry without changing the base revision.'}}, status_code=503)

    @app.exception_handler(TimeoutError)
    async def timeout_error(request, error):
        return JSONResponse({'detail': {'code': 'validation_timeout', 'message': 'Validation timed out; no story changes were applied'}}, status_code=503)

    from .provider import ProviderError
    @app.exception_handler(ProviderError)
    async def provider_error(request, error):
        return JSONResponse({'detail': {'code': error.code, 'message': str(error)}}, status_code=getattr(error, 'status_code', 502))

    def principal(request: Request):
        return request.state.principal

    @app.get('/healthz')
    async def health():
        return {'status': 'ok'}

    @app.get('/api/config')
    async def config(actor=Depends(principal)):
        require_owner(actor)
        return {'storage': 'sqlite', 'provider_configured': service.provider is not None, 'operations': ['set_story_context', 'edit_event', 'reorder_timeline'], 'single_owner': True, 'proposal_review_required': True}

    @app.get('/api/operations/schema')
    async def operation_schema(actor=Depends(principal)):
        return operation_adapter.json_schema()

    @app.get('/api/projects')
    async def list_projects(actor=Depends(principal)):
        return await service.list_projects(actor)

    @app.post('/api/projects', status_code=201)
    async def create_project(body: CreateProject, actor=Depends(principal)):
        return await service.create_project(actor, body.project)

    @app.get('/api/projects/{project_id}')
    async def get_project(project_id: str, actor=Depends(principal)):
        return await service.get_project(actor, project_id)

    @app.put('/api/projects/{project_id}')
    async def replace_project(project_id: str, body: ReplaceProject, actor=Depends(principal)):
        return await service.replace_project(actor, project_id, body.base_revision, body.project)

    @app.post('/api/projects/{project_id}/operations')
    async def operations(project_id: str, body: OperationsRequest, actor=Depends(principal)):
        return await service.apply_operations(actor, project_id, body.base_revision, [op.model_dump(exclude_unset=True) for op in body.operations], body.summary)

    @app.post('/api/projects/{project_id}/proposals', status_code=201)
    async def propose(project_id: str, body: OperationsRequest, actor=Depends(principal)):
        return await service.create_proposal(actor, project_id, body.base_revision, [op.model_dump(exclude_unset=True) for op in body.operations], body.summary, source='agent' if actor.role == 'agent' else 'owner_proposal')

    @app.get('/api/projects/{project_id}/proposals')
    async def proposals(project_id: str, actor=Depends(principal)):
        return await service.list_proposals(actor, project_id)

    @app.post('/api/projects/{project_id}/proposals/{proposal_id}/accept')
    async def accept(project_id: str, proposal_id: str, body: RevisionRequest, actor=Depends(principal)):
        return await service.decide_proposal(actor, project_id, proposal_id, accept=True, base_revision=body.base_revision)

    @app.post('/api/projects/{project_id}/proposals/{proposal_id}/reject')
    async def reject(project_id: str, proposal_id: str, actor=Depends(principal)):
        return await service.decide_proposal(actor, project_id, proposal_id, accept=False)

    @app.get('/api/projects/{project_id}/history')
    async def history(project_id: str, actor=Depends(principal)):
        return await service.history(actor, project_id)

    @app.post('/api/projects/{project_id}/restore')
    async def restore(project_id: str, body: RestoreRequest, actor=Depends(principal)):
        return await service.restore(actor, project_id, body.base_revision, body.target_revision)

    @app.post('/api/projects/{project_id}/assistant')
    async def assistant(project_id: str, body: AssistantRequest, request: Request, actor=Depends(principal)):
        # Watch the transport explicitly: ASGI does not automatically cancel
        # endpoint work when the browser leaves. Acceptance is always separate.
        task = asyncio.create_task(service.assistant(actor, project_id, body.base_revision, body.prompt))
        async def disconnected():
            while True:
                message = await request.receive()
                if message['type'] == 'http.disconnect':
                    return
        watcher = asyncio.create_task(disconnected())
        try:
            finished, _ = await asyncio.wait((task, watcher), return_when=asyncio.FIRST_COMPLETED)
            if watcher in finished:
                raise ServiceError('request_cancelled', 'Assistant request disconnected; refresh proposals before retrying', 499)
            return await task
        finally:
            for pending in (task, watcher):
                if not pending.done():
                    pending.cancel()
            await asyncio.gather(task, watcher, return_exceptions=True)

    app.mount('/mcp', mcp_app)
    app.add_middleware(BoundaryMiddleware, authenticate=auth, allowed_origins=settings.allowed_origins)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_credentials=False, allow_methods=['GET','POST','PUT','OPTIONS'], allow_headers=['Authorization','Content-Type','Accept','Mcp-Session-Id','Mcp-Protocol-Version'], expose_headers=['Mcp-Session-Id'])
    return app
