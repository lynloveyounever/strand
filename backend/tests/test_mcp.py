import asyncio
from contextlib import asynccontextmanager, contextmanager
from copy import deepcopy
from types import SimpleNamespace
import unittest

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server.fastmcp.exceptions import ToolError
from mcp.server.lowlevel.server import request_ctx
from mcp.shared.context import RequestContext
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount

from strand_api.auth import Principal
from strand_api.errors import ServiceError
from strand_api.mcp_server import create_mcp


class MemoryService:
    def __init__(self):
        self.projects = {
            "story-a": {"id": "story-a", "owner_id": "owner-a", "revision": 1, "project": {"title": "A"}},
            "story-b": {"id": "story-b", "owner_id": "owner-b", "revision": 1, "project": {"title": "B"}},
        }
        self.proposals = []
        self.calls = []

    async def list_projects(self, principal):
        self.calls.append(("list", principal.owner_id))
        await asyncio.sleep(0)
        return [deepcopy(project) for project in self.projects.values() if project["owner_id"] == principal.owner_id]

    async def get_project(self, principal, project_id):
        self.calls.append(("get", principal.owner_id, project_id))
        project = self.projects.get(project_id)
        if project is None or project["owner_id"] != principal.owner_id:
            raise ServiceError("not_found", "Story not found", 404)
        return deepcopy(project)

    async def create_proposal(self, principal, project_id, base_revision, operations, summary, source):
        project = await self.get_project(principal, project_id)
        if project["revision"] != base_revision:
            raise ServiceError("revision_conflict", "Story revision has changed", 409)
        proposal = {"id": f"proposal-{len(self.proposals)}", "project_id": project_id, "base_revision": base_revision, "summary": summary, "operations": operations, "source": source, "status": "pending"}
        self.proposals.append(proposal)
        return deepcopy(proposal)


def authenticate(authorization):
    if authorization == "Bearer agent-a":
        return Principal("owner-a", "agent")
    if authorization == "Bearer agent-b":
        return Principal("owner-b", "agent")
    if authorization == "Bearer owner-a":
        return Principal("owner-a", "owner")
    raise ServiceError("unauthorized", "A valid Bearer credential is required", 401)


@contextmanager
def sdk_context(authorization=None):
    """Set the official SDK request context only for direct in-process tests."""
    headers = [(b"authorization", authorization.encode())] if authorization else []
    request = Request({"type": "http", "method": "POST", "path": "/mcp/", "headers": headers})
    token = request_ctx.set(RequestContext(request_id="test", meta=None, session=SimpleNamespace(), lifespan_context={}, request=request))
    try:
        yield
    finally:
        request_ctx.reset(token)


class AuthBoundary:
    """Minimal outer application auth for protocol integration testing."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            try:
                authenticate(Request(scope).headers.get("authorization"))
            except ServiceError:
                return await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
        await self.app(scope, receive, send)


class MCPTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = MemoryService()
        self.server = create_mcp(self.service, authenticate)

    async def call(self, tool, arguments, token="Bearer agent-a"):
        with sdk_context(token):
            return await self.server.call_tool(tool, arguments)

    async def test_only_bounded_read_and_proposal_tools_are_registered(self):
        tools = await self.server.list_tools()
        self.assertEqual({tool.name for tool in tools}, {"list_stories", "read_story", "propose_story_changes"})
        for tool in tools:
            self.assertNotIn("owner_id", tool.inputSchema.get("properties", {}))
            self.assertNotIn("source", tool.inputSchema.get("properties", {}))
            self.assertFalse(tool.annotations.openWorldHint)
        for name in ["accept_proposal", "reject_proposal", "apply_changes", "shell", "read_file", "fetch_url"]:
            with self.subTest(name=name), self.assertRaises(ToolError):
                await self.call(name, {})

    async def test_calls_require_current_authenticated_http_context(self):
        with self.assertRaises(ToolError):
            await self.server.call_tool("list_stories", {})
        for token in [None, "Bearer bad"]:
            with self.subTest(token=token), self.assertRaises(ToolError):
                await self.call("list_stories", {}, token)
        self.assertEqual(self.service.calls, [])
        await self.call("list_stories", {})
        self.assertEqual(self.service.calls, [("list", "owner-a")])
        # A successful previous request cannot authorize a later request.
        with self.assertRaises(ToolError):
            await self.call("list_stories", {}, None)

    async def test_authentication_is_per_request_and_concurrency_is_isolated(self):
        await asyncio.gather(
            self.call("read_story", {"project_id": "story-a"}, "Bearer agent-a"),
            self.call("read_story", {"project_id": "story-b"}, "Bearer agent-b"),
        )
        self.assertEqual(set(self.service.calls), {("get", "owner-a", "story-a"), ("get", "owner-b", "story-b")})
        with self.assertRaises(ToolError):
            await self.call("read_story", {"project_id": "story-b"}, "Bearer agent-a")

    async def test_proposals_are_pending_and_never_apply(self):
        before = deepcopy(self.service.projects)
        await self.call("propose_story_changes", {"project_id": "story-a", "base_revision": 1, "operations": [{"op": "set_story_context", "title": "Suggested"}], "summary": "Try a new title"})
        self.assertEqual(self.service.projects, before)
        self.assertEqual(len(self.service.proposals), 1)
        self.assertEqual(self.service.proposals[0]["status"], "pending")
        self.assertEqual(self.service.proposals[0]["source"], "mcp")
        self.assertEqual(self.service.proposals[0]["operations"], [{"op": "set_story_context", "title": "Suggested"}])
        with self.assertRaises(ToolError):
            await self.call("propose_story_changes", {"project_id": "story-a", "base_revision": 2, "operations": [{"op": "set_story_context", "title": "Stale"}], "summary": "Stale"})
        self.assertEqual(len(self.service.proposals), 1)

    async def test_invalid_operations_fail_before_service_mutation(self):
        for operations in [[], [{"op": "set_story_context"}], [{"op": "set_story_context", "title": None}], [{"op": "set_story_context", "title": "X", "apply": True}], [{"op": "shell", "command": "ls"}], [{"op": "reorder_timeline", "basis": "all", "occurrence_ids": ["o1"]}]]:
            with self.subTest(operations=operations), self.assertRaises(ToolError):
                await self.call("propose_story_changes", {"project_id": "story-a", "base_revision": 1, "operations": operations, "summary": "Proposal"})
        self.assertEqual(self.service.proposals, [])

    async def test_unexpected_service_errors_do_not_leak_secrets(self):
        async def broken(principal):
            raise RuntimeError("database password=secret")
        self.service.list_projects = broken
        with self.assertRaises(ToolError) as caught:
            await self.call("list_stories", {})
        self.assertNotIn("secret", str(caught.exception))

    async def test_async_authenticator_is_supported(self):
        async def auth(header):
            await asyncio.sleep(0)
            return authenticate(header)
        server = create_mcp(self.service, auth)
        with sdk_context("Bearer agent-a"):
            await server.call_tool("read_story", {"project_id": "story-a"})
        self.assertEqual(self.service.calls, [("get", "owner-a", "story-a")])

    async def test_official_client_streamable_http_and_outer_auth(self):
        mcp_app = self.server.streamable_http_app()

        @asynccontextmanager
        async def lifespan(app):
            async with self.server.session_manager.run():
                yield

        app = Starlette(routes=[Mount("/mcp", app=mcp_app)], lifespan=lifespan)
        protected = AuthBoundary(app)
        before = deepcopy(self.service.projects)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=protected), base_url="http://localhost:8000") as unauthenticated:
                response = await unauthenticated.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
                self.assertEqual(response.status_code, 401)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=protected), headers={"Authorization": "Bearer agent-a"}) as http_client:
                async with streamable_http_client("http://localhost:8000/mcp/", http_client=http_client, terminate_on_close=False) as (read, write, session_id):
                    async with ClientSession(read, write) as client:
                        await client.initialize()
                        self.assertIsNone(session_id(), "Stateless transport must not cache identity in a session")
                        available = await client.list_tools()
                        self.assertEqual({tool.name for tool in available.tools}, {"list_stories", "read_story", "propose_story_changes"})
                        read_result = await client.call_tool("read_story", {"project_id": "story-a"})
                        self.assertFalse(read_result.isError)
                        denied = await client.call_tool("read_story", {"project_id": "story-b"})
                        self.assertTrue(denied.isError)
                        proposal = await client.call_tool("propose_story_changes", {"project_id": "story-a", "base_revision": 1, "operations": [{"op": "set_story_context", "premise": "Proposed premise"}], "summary": "For author review"})
                        self.assertFalse(proposal.isError)
                        attempted_approval = await client.call_tool("accept_proposal", {"proposal_id": "proposal-0"})
                        self.assertTrue(attempted_approval.isError)
        self.assertEqual(self.service.projects, before)
        self.assertEqual(self.service.proposals[0]["status"], "pending")


if __name__ == "__main__":
    unittest.main()


async def test_real_app_sdk_proposal_requires_separate_owner_acceptance(service, project):
    """Exercise the real HTTP boundary, service, SQLite store, and domain bridge."""
    from strand_api.app import Settings, create_app

    owner_token, agent_token = "owner-" + "a" * 40, "agent-" + "b" * 40
    actor = Principal("strand-owner", "owner")
    initial = await service.create_project(actor, project)
    app = create_app(Settings(owner_token=owner_token, agent_token=agent_token), service=service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000") as plain:
            unauthenticated = await plain.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
            assert unauthenticated.status_code == 401
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000", headers={"Authorization": "Bearer " + agent_token}) as agent_http:
            async with streamable_http_client("http://localhost:8000/mcp/", http_client=agent_http, terminate_on_close=False) as (read, write, session_id):
                async with ClientSession(read, write) as client:
                    await client.initialize()
                    assert session_id() is None
                    result = await client.call_tool("propose_story_changes", {
                        "project_id": initial["id"], "base_revision": 1,
                        "operations": [{"op": "set_story_context", "title": "An owner-reviewed title"}],
                        "summary": "Clarify the title for author review",
                    })
                    assert not result.isError
                    proposals = (await service.list_proposals(actor, initial["id"]))["proposals"]
                    assert len(proposals) == 1
                    proposal = proposals[0]
                    assert proposal["status"] == "pending" and proposal["source"] == "mcp"
                    assert await service.get_project(actor, initial["id"]) == initial
                    direct_apply = await agent_http.post(f"/api/projects/{initial['id']}/proposals/{proposal['id']}/accept", json={"base_revision": 1})
                    assert direct_apply.status_code == 403
                    unknown_tool = await client.call_tool("accept_proposal", {"proposal_id": proposal["id"]})
                    assert unknown_tool.isError
                    assert await service.get_project(actor, initial["id"]) == initial
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:8000", headers={"Authorization": "Bearer " + owner_token}) as owner_http:
            accepted = await owner_http.post(f"/api/projects/{initial['id']}/proposals/{proposal['id']}/accept", json={"base_revision": 1})
            assert accepted.status_code == 200
            assert accepted.json()["revision"] == 2
            assert accepted.json()["project"]["title"] == "An owner-reviewed title"
