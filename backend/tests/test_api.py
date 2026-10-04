import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from strand_api.app import Settings, create_app

OWNER = 'test-owner-' + 'o'*40
AGENT = 'test-agent-' + 'a'*40

def settings(tmp_path, **kw):
    return Settings(database_path=str(tmp_path/'api.sqlite3'),owner_token=OWNER,agent_token=AGENT, **kw)

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(settings(tmp_path))) as client:
        client.headers['Authorization'] = 'Bearer '+OWNER
        yield client

def test_network_routes_fail_closed_without_configuration(tmp_path):
    with TestClient(create_app(Settings(database_path=str(tmp_path/'closed.sqlite3')))) as client:
        assert client.get('/healthz').status_code == 200
        for route in ['/api/projects','/api/config','/docs','/openapi.json','/mcp/']:
            response = client.get(route)
            assert response.status_code == 503
            assert response.json()['detail']['code'] == 'auth_not_configured'

def test_invalid_credentials_and_unknown_origins(client):
    assert client.get('/api/projects',headers={'Authorization':'Bearer wrong'}).status_code == 401
    assert client.get('/api/projects',headers={'Origin':'https://evil.example'}).status_code == 403
    assert client.get('/api/projects',headers={'Host':'evil.example'}).status_code == 400
    preflight = client.options('/api/projects', headers={'Origin':'https://evil.example','Access-Control-Request-Method':'POST'})
    assert 'access-control-allow-origin' not in preflight.headers

def test_http_story_update_conflict_and_history(client, project):
    first = client.post('/api/projects',json={'project':project})
    assert first.status_code == 201,first.text
    record=first.json(); pid=record['id']
    assert client.get('/api/projects/'+pid).json() == record
    updated=client.put('/api/projects/'+pid,json={'base_revision':1,'project':{**project,'title':'HTTP update'}})
    assert updated.status_code == 200
    conflict=client.put('/api/projects/'+pid,json={'base_revision':1,'project':project})
    assert conflict.status_code == 409 and conflict.json()['detail']['current_revision'] == 2
    restore=client.post('/api/projects/'+pid+'/restore',json={'base_revision':2,'target_revision':1})
    assert restore.status_code == 200 and restore.json()['revision'] == 3
    assert len(client.get('/api/projects/'+pid+'/history').json()['versions']) == 3

def test_agent_proposal_accept_bypass_denied_and_owner_review(client, project):
    record=client.post('/api/projects',json={'project':project}).json(); pid=record['id']
    agent={'Authorization':'Bearer '+AGENT}
    request={'base_revision':1,'operations':[{'op':'set_story_context','title':'Agent proposal'}],'summary':'A proposal'}
    proposal=client.post('/api/projects/'+pid+'/proposals',json=request,headers=agent)
    assert proposal.status_code == 201,proposal.text
    proposal_id=proposal.json()['id']
    assert proposal.json()['source'] == 'agent'
    assert client.post('/api/projects/'+pid+'/operations',json=request,headers=agent).status_code == 403
    assert client.post('/api/projects/'+pid+'/proposals/'+proposal_id+'/accept',json={'base_revision':1},headers=agent).status_code == 403
    assert client.post('/api/projects/'+pid+'/proposals/'+proposal_id+'/reject',json={},headers=agent).status_code == 403
    assert client.get('/api/projects/'+pid).json()['revision'] == 1
    applied=client.post('/api/projects/'+pid+'/proposals/'+proposal_id+'/accept',json={'base_revision':1})
    assert applied.status_code == 200 and applied.json()['revision'] == 2

def test_api_rejects_unknown_control_keys_and_non_json(client,project):
    record=client.post('/api/projects',json={'project':project}).json(); pid=record['id']
    body={'base_revision':1,'operations':[{'op':'set_story_context','title':'bad'}],'summary':'bad','source':'owner','approved':True}
    response=client.post('/api/projects/'+pid+'/proposals',json=body)
    assert response.status_code == 422
    assert 'owner' not in response.text
    assert client.post('/api/projects',content='x',headers={'Content-Type':'text/plain'}).status_code == 415
    assert client.post('/api/projects',content=b' ' * 8_000_001,headers={'Content-Type':'application/json'}).status_code == 413

def test_owner_typed_operation_and_unconfigured_assistant(client, project):
    record=client.post('/api/projects',json={'project':project}).json(); pid=record['id']
    config=client.get('/api/config').json()
    assert config['provider_configured'] is False
    assert set(config['operations']) == {'set_story_context','edit_event','reorder_timeline'}
    assert client.get('/api/operations/schema').json()['maxItems'] == 20
    event=next(x for x in project['units'] if x['kind']=='beat')
    response=client.post('/api/projects/'+pid+'/operations',json={'base_revision':1,'summary':'Refine opening','operations':[{'op':'edit_event','event_id':event['id'],'summary':'A better opening'}]})
    assert response.status_code == 200
    failure=client.post('/api/projects/'+pid+'/assistant',json={'base_revision':2,'prompt':'Help'})
    assert failure.status_code == 503 and failure.json()['detail']['code'] == 'provider_not_configured'

def test_provider_mock_entire_http_review_flow(tmp_path,project):
    class Provider:
        async def propose(self,project,prompt,schema):
            assert prompt=='Improve premise' and schema['type']=='array'
            return {'summary':'Suggested premise','operations':[{'op':'set_story_context','premise':'A reviewable idea'}]}
    with TestClient(create_app(settings(tmp_path),provider=Provider()),headers={'Authorization':'Bearer '+OWNER}) as client:
        record=client.post('/api/projects',json={'project':project}).json();pid=record['id']
        p=client.post('/api/projects/'+pid+'/assistant',json={'base_revision':1,'prompt':'Improve premise'})
        assert p.status_code == 200,p.text
        assert p.json()['status']=='pending' and p.json()['source']=='assistant'
        assert client.get('/api/projects/'+pid).json()['revision']==1
        assert client.post('/api/projects/'+pid+'/proposals/'+p.json()['id']+'/accept',json={'base_revision':1}).json()['revision']==2

def test_mcp_initialization_auth_and_custom_host(tmp_path):
    app=create_app(settings(tmp_path,allowed_hosts=('strand.example',),allowed_origins=('https://strand.example',)))
    body={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'test','version':'1'}}}
    with TestClient(app,base_url='https://strand.example') as client:
        headers={'Accept':'application/json, text/event-stream','Origin':'https://strand.example'}
        assert client.post('/mcp/',json=body,headers=headers).status_code==401
        headers['Authorization']='Bearer '+AGENT
        response=client.post('/mcp/',json=body,headers=headers)
        assert response.status_code==200,response.text
        assert response.json()['result']['serverInfo']['name']=='Strand story architecture'

@pytest.mark.parametrize('owner,agent',[('short',''),(OWNER,OWNER),('',AGENT)])
def test_unsafe_auth_configuration_rejected(tmp_path,owner,agent):
    with pytest.raises(ValueError):
        create_app(Settings(database_path=str(tmp_path/'bad.sqlite3'),owner_token=owner,agent_token=agent))

async def test_disconnect_cancels_provider_without_proposal(tmp_path,project):
    import httpx
    started, cancelled, disconnected = asyncio.Event(), asyncio.Event(), asyncio.Event()
    class SlowProvider:
        async def propose(self,*args):
            started.set()
            try: await asyncio.sleep(30)
            except asyncio.CancelledError:
                cancelled.set(); raise
    app=create_app(settings(tmp_path),provider=SlowProvider())
    service=app.state.service; owner=app.state.authenticate('Bearer '+OWNER)
    record=await service.create_project(owner,project)
    body=json.dumps({'base_revision':1,'prompt':'Help'}).encode()
    consumed=False
    async def receive():
        nonlocal consumed
        if not consumed:
            consumed=True
            return {'type':'http.request','body':body,'more_body':False}
        if disconnected.is_set(): return {'type':'http.disconnect'}
        await disconnected.wait()
        return {'type':'http.disconnect'}
    responses=[]
    async def send(message): responses.append(message)
    scope={'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':'POST','scheme':'http','path':'/api/projects/'+record['id']+'/assistant','raw_path':b'/','query_string':b'','root_path':'','server':('localhost',8000),'client':('127.0.0.1',1234),'headers':[(b'host',b'localhost'),(b'authorization',('Bearer '+OWNER).encode()),(b'content-type',b'application/json')]}
    task=asyncio.create_task(app(scope,receive,send))
    await asyncio.wait_for(started.wait(),3)
    disconnected.set()
    await asyncio.wait_for(task,3)
    assert cancelled.is_set()
    assert (await service.list_proposals(owner,record['id']))['proposals']==[]
    assert (await service.get_project(owner,record['id']))['revision']==1

def test_non_ascii_tokens_rejected_safely(tmp_path):
    from strand_api.auth import Authenticator
    from strand_api.errors import ServiceError
    with pytest.raises(ValueError): Authenticator('é'*40)
    with pytest.raises(ServiceError) as error: Authenticator(OWNER)('Bearer '+'é'*40)
    assert error.value.status==401
