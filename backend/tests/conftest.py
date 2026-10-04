import json
from pathlib import Path
import pytest
from strand_api.auth import Principal
from strand_api.storage import Database
from strand_api.service import StoryService

@pytest.fixture
def project():
    return json.loads((Path(__file__).parent / 'fixtures/story.json').read_text())

@pytest.fixture
def owner():
    return Principal('owner-a', 'owner')

@pytest.fixture
def agent():
    return Principal('owner-a', 'agent')

@pytest.fixture
def service(tmp_path):
    return StoryService(Database(str(tmp_path / 'stories.sqlite3')))
