import asyncio
import copy
import json
import sqlite3
import pytest
from strand_api.auth import Principal
from strand_api.errors import ServiceError
from strand_api.storage import Database
from strand_api.service import StoryService

async def create(service, owner, project):
    return await service.create_project(owner, project)

async def test_create_read_persists_restart_backup(service, owner, project, tmp_path):
    record = await create(service, owner, project)
    again = StoryService(Database(service.db.path))
    assert (await again.get_project(owner, record['id'])) == record
    assert (await again.list_projects(owner))['projects'][0]['title'] == project['title']
    backup = str(tmp_path / 'backup.sqlite3')
    service.db.backup(backup)
    assert (await StoryService(Database(backup)).get_project(owner, record['id'])) == record
    with pytest.raises(ValueError):
        service.db.backup(backup)

async def test_replace_requires_exact_revision_and_retains_history(service, owner, project):
    first = await create(service, owner, project)
    project['premise'] = 'An altered premise'
    second = await service.replace_project(owner, first['id'], 1, project)
    assert second['revision'] == 2
    with pytest.raises(ServiceError) as error:
        await service.replace_project(owner, first['id'], 1, project)
    assert error.value.status == 409 and error.value.extra['current_revision'] == 2
    restored = await service.restore(owner, first['id'], 2, 1)
    assert restored['revision'] == 3 and restored['project'] == first['project']
    assert [v['revision'] for v in (await service.history(owner, first['id']))['versions']] == [3, 2, 1]

async def test_concurrent_writers_only_one_commits(service, owner, project):
    first = await create(service, owner, project)
    outcomes = await asyncio.gather(*(service.replace_project(owner, first['id'], 1, {**project, 'title': title}) for title in ['one', 'two']), return_exceptions=True)
    assert sum(isinstance(x, ServiceError) and x.status == 409 for x in outcomes) == 1
    assert (await service.get_project(owner, first['id']))['revision'] == 2

async def test_propose_preview_accept_and_duplicate_protection(service, owner, agent, project):
    first = await create(service, owner, project)
    proposal = await service.create_proposal(agent, first['id'], 1, [{'op':'set_story_context','title':'Reviewed title'}], 'Rename the story')
    assert proposal['status'] == 'pending'
    assert any(c['path'] == '/title' and c['before'] == project['title'] and c['after'] == 'Reviewed title' for c in proposal['changes'])
    assert (await service.get_project(owner, first['id'])) == first
    for who in [agent, Principal('owner-b', 'owner')]:
        with pytest.raises(ServiceError) as error:
            await service.decide_proposal(who, first['id'], proposal['id'], accept=True, base_revision=1)
        assert error.value.status in (403,404)
    accepted = await service.decide_proposal(owner, first['id'], proposal['id'], accept=True, base_revision=1)
    assert accepted['revision'] == 2 and accepted['project']['title'] == 'Reviewed title'
    with pytest.raises(ServiceError) as error:
        await service.decide_proposal(owner, first['id'], proposal['id'], accept=True, base_revision=2)
    assert error.value.status == 409
    history = (await service.history(owner, first['id']))['versions']
    assert history[0]['source'] == 'owner_accepted_mcp'

async def test_reject_never_changes_story_and_stale_proposal_cannot_apply(service, owner, agent, project):
    first = await create(service, owner, project)
    def make(title):
        return service.create_proposal(agent, first['id'], 1, [{'op':'set_story_context','title':title}], title)
    rejected, stale = await make('Reject'), await make('Stale')
    result = await service.decide_proposal(owner, first['id'], rejected['id'], accept=False)
    assert result['status'] == 'rejected'
    assert (await service.get_project(owner, first['id'])) == first
    await service.replace_project(owner, first['id'], 1, {**project,'title':'Newer'})
    with pytest.raises(ServiceError) as error:
        await service.decide_proposal(owner, first['id'], stale['id'], accept=True, base_revision=2)
    assert error.value.status == 409
    assert (await service.get_project(owner, first['id']))['project']['title'] == 'Newer'

async def test_external_agent_cannot_direct_write_create_restore_reject(service, owner, agent, project):
    first = await create(service, owner, project)
    proposal = await service.create_proposal(agent, first['id'], 1, [{'op':'set_story_context','title':'Suggestion'}], 'Suggestion')
    forbidden = [service.create_project(agent, project), service.replace_project(agent,first['id'],1,project), service.restore(agent,first['id'],1,1), service.apply_operations(agent,first['id'],1,[{'op':'set_story_context','title':'Bypass'}],'No'), service.decide_proposal(agent,first['id'],proposal['id'],accept=False)]
    for call in forbidden:
        with pytest.raises(ServiceError) as error:
            await call
        assert error.value.status == 403
    assert (await service.get_project(owner, first['id'])) == first

async def test_owner_isolation_no_id_disclosure(service, owner, project):
    first = await create(service, owner, project)
    other = Principal('owner-b','owner')
    assert (await service.list_projects(other)) == {'projects':[]}
    for call in [service.get_project(other,first['id']),service.history(other,first['id']),service.list_proposals(other,first['id']),service.replace_project(other,first['id'],1,project),service.create_proposal(other,first['id'],1,[{'op':'set_story_context','title':'No'}],'No')]:
        with pytest.raises(ServiceError) as error:
            await call
        assert error.value.status == 404

@pytest.mark.parametrize('operations', [
    [{'op':'exec','command':'id'}], [{'op':'read_file','path':'/etc/passwd'}],
    [{'op':'set_story_context','title':'x','__proto__':{}}],
    [{'op':'set_story_context','title':None}], [{'op':'set_story_context'}],
    [{'op':'edit_event','event_id':'unknown','title':'x'}],
    [{'op':'reorder_timeline','basis':'narrative','occurrence_ids':['missing']}],
    [{'op':'set_story_context','title':'x'*301}], [],
])
async def test_invalid_operations_are_atomic(service, owner, agent, project, operations):
    first = await create(service, owner, project)
    with pytest.raises(ServiceError):
        await service.create_proposal(agent, first['id'], 1, operations, 'Invalid')
    assert (await service.get_project(owner, first['id'])) == first
    assert (await service.list_proposals(owner, first['id']))['proposals'] == []

async def test_domain_exact_orders_roles_and_track_preservation(service, owner, agent, project):
    first = await create(service, owner, project)
    original = first['project']
    ids = [p['id'] for p in original['timelines']['narrative']['placements']][::-1]
    proposal = await service.create_proposal(agent, first['id'],1,[{'op':'reorder_timeline','basis':'narrative','occurrence_ids':ids}],'Reverse presentation')
    second = await service.decide_proposal(owner,first['id'],proposal['id'],accept=True,base_revision=1)
    actual = second['project']
    assert [p['id'] for p in actual['timelines']['narrative']['placements']] == ids
    assert actual['timelines']['reality'] == original['timelines']['reality']
    assert actual['timelines']['audience'] == original['timelines']['audience']
    assert actual['tracks'] == original['tracks']
    assert actual.get('storyTracks') == original.get('storyTracks')

async def test_shared_validator_rejects_broken_links_duplicate_reality_and_roles(service, owner, project):
    variants = []
    bad = copy.deepcopy(project); bad['units'][1]['parentId'] = 'missing'; variants.append(bad)
    bad = copy.deepcopy(project); bad['timelines']['reality']['placements'][1]['eventId'] = bad['timelines']['reality']['placements'][0]['eventId']; variants.append(bad)
    bad = copy.deepcopy(project); bad['tracks'][0]['kind'] = 'content'; variants.append(bad)
    for bad in variants:
        with pytest.raises(ServiceError) as error:
            await create(service,owner,bad)
        assert error.value.status == 422
    assert (await service.list_projects(owner))['projects'] == []

async def test_later_invalid_operation_does_not_commit_partial_batch(service, owner, agent, project):
    first = await create(service,owner,project)
    with pytest.raises(ServiceError):
        await service.create_proposal(agent,first['id'],1,[{'op':'set_story_context','title':'Not saved'},{'op':'edit_event','event_id':'missing','summary':'oops'}],'Invalid batch')
    assert (await service.get_project(owner,first['id'])) == first

async def test_assistant_unconfigured_and_cancel_never_change_story(service, owner, project):
    first = await create(service,owner,project)
    with pytest.raises(ServiceError) as error:
        await service.assistant(owner,first['id'],1,'Help')
    assert error.value.code == 'provider_not_configured'
    cancelled = asyncio.Event()
    class SlowProvider:
        async def propose(self,*args):
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                cancelled.set()
                raise
    service.provider = SlowProvider()
    task = asyncio.create_task(service.assistant(owner,first['id'],1,'Help'))
    await asyncio.sleep(0.01)
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert cancelled.is_set()
    assert (await service.get_project(owner,first['id'])) == first
    assert (await service.list_proposals(owner,first['id']))['proposals'] == []

async def test_assistant_validates_provider_output_and_revision_after_model_wait(service, owner, project):
    first = await create(service,owner,project)
    class FakeProvider:
        async def propose(self,*args):
            return {'summary':'Suggested premise','operations':[{'op':'set_story_context','premise':'New premise'}]}
    service.provider = FakeProvider()
    proposal = await service.assistant(owner,first['id'],1,'Suggest a premise')
    assert proposal['status'] == 'pending' and proposal['source'] == 'assistant'
    assert (await service.get_project(owner,first['id'])) == first
    class RacingProvider:
        async def propose(self,*args):
            await service.replace_project(owner,first['id'],1,{**project,'title':'Newer version'})
            return {'summary':'Too late','operations':[{'op':'set_story_context','title':'Old version'}]}
    service.provider = RacingProvider()
    with pytest.raises(ServiceError) as error:
        await service.assistant(owner,first['id'],1,'Help')
    assert error.value.status == 409
    assert len((await service.list_proposals(owner,first['id']))['proposals']) == 1

async def test_schema_migration_rejects_newer_database(tmp_path):
    path = str(tmp_path/'future.sqlite3')
    db = Database(path)
    with db.connect() as conn: conn.execute('INSERT INTO schema_migrations(version) VALUES (2)')
    with pytest.raises(RuntimeError): Database(path)

async def test_pending_proposals_do_not_disappear_behind_reviewed_history(service,owner,agent,project):
    first=await create(service,owner,project)
    pending=await service.create_proposal(agent,first['id'],1,[{'op':'set_story_context','title':'Still waiting'}],'Still waiting')
    with service.db.connect(write=True) as conn:
        row=conn.execute('SELECT * FROM proposals WHERE id=?',(pending['id'],)).fetchone()
        for index in range(105):
            values=list(row); values[0]=f'finished-{index}'; values[3]='rejected'; values[8]='2999-01-01T00:00:00Z'
            conn.execute('INSERT INTO proposals VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',values)
    listed=(await service.list_proposals(owner,first['id']))['proposals']
    assert len(listed)==100 and listed[0]['id']==pending['id']
