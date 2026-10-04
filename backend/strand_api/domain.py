import asyncio
import json
from pathlib import Path
from .errors import ServiceError

BRIDGE = Path(__file__).resolve().parents[1] / 'domain' / 'bridge.mjs'

class Domain:
    def __init__(self):
        self._limit = asyncio.Semaphore(4)

    async def _run(self, action, project, operations=None):
        payload = json.dumps({'action': action, 'project': project, 'operations': operations}, ensure_ascii=False, allow_nan=False).encode()
        if len(payload) > 8_000_000:
            raise ServiceError('too_large', 'Project exceeds the 8 MB limit', 413)
        if not BRIDGE.is_file():
            raise ServiceError('domain_unavailable', 'Build the shared domain bridge before starting the server', 503)
        async with self._limit:
            process = await asyncio.create_subprocess_exec('node', '--max-old-space-size=128', str(BRIDGE), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            try:
                out, _ = await asyncio.wait_for(process.communicate(payload), timeout=10)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                await process.wait()
                raise
        if len(out) > 8_000_000:
            raise ServiceError('too_large', 'Resulting project exceeds the 8 MB limit', 413)
        try:
            result = json.loads(out)
        except (ValueError, UnicodeError):
            raise ServiceError('domain_unavailable', 'Shared domain validation did not complete', 503) from None
        if process.returncode or 'error' in result:
            raise ServiceError('invalid_project', str(result.get('error', 'Invalid project'))[:1000], 422)
        return result['project']

    async def validate(self, project):
        return await self._run('validate', project)

    async def apply(self, project, operations):
        return await self._run('apply', project, operations)
