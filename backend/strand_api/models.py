from typing import Annotated, Any, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

Text = Annotated[str, StringConstraints(max_length=20_000)]
Identifier = Annotated[str, StringConstraints(min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')]
Revision = Annotated[int, Field(strict=True, ge=1)]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

class SetStoryContext(StrictModel):
    op: Literal['set_story_context']
    title: Annotated[str, StringConstraints(max_length=300)] | None = None
    premise: Text | None = None
    themeQuestion: Text | None = None

    @model_validator(mode='after')
    def has_patch(self):
        fields = self.model_fields_set - {'op'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('Provide at least one non-null field')
        return self

class EditEvent(StrictModel):
    op: Literal['edit_event']
    event_id: Identifier
    title: Text | None = None
    summary: Text | None = None
    intent: Text | None = None
    audienceEffect: Text | None = None
    turningPoint: bool | None = None
    eventType: Literal['action', 'dialogue', 'foreshadow', 'reveal'] | None = None

    @model_validator(mode='after')
    def has_patch(self):
        fields = self.model_fields_set - {'op', 'event_id'}
        if not fields or any(getattr(self, field) is None for field in fields):
            raise ValueError('Provide at least one non-null field')
        return self

class ReorderTimeline(StrictModel):
    op: Literal['reorder_timeline']
    basis: Literal['reality', 'narrative', 'audience']
    occurrence_ids: Annotated[list[Identifier], Field(min_length=1, max_length=3000)]

Operation = Annotated[SetStoryContext | EditEvent | ReorderTimeline, Field(discriminator='op')]
Operations = Annotated[list[Operation], Field(min_length=1, max_length=20)]
operation_adapter = TypeAdapter(Operations)

class CreateProject(StrictModel):
    project: dict[str, Any]

class ReplaceProject(CreateProject):
    base_revision: Revision

class RevisionRequest(StrictModel):
    base_revision: Revision

class OperationsRequest(RevisionRequest):
    operations: Operations
    summary: Annotated[str, StringConstraints(min_length=1, max_length=2000)]

class AssistantRequest(RevisionRequest):
    prompt: Annotated[str, StringConstraints(min_length=1, max_length=10_000)]

class RestoreRequest(RevisionRequest):
    target_revision: Revision
