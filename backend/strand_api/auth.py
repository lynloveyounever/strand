from dataclasses import dataclass
import hmac
from .errors import ServiceError

@dataclass(frozen=True)
class Principal:
    owner_id: str
    role: str

class Authenticator:
    """Single-owner deployment. Agent credential can only read/propose.

    Separate credentials are configured by the operator; this service never
    creates, returns, logs or persists them. Empty configuration fails closed.
    """
    def __init__(self, owner_token='', agent_token='', owner_id='strand-owner'):
        for token in (owner_token, agent_token):
            if token and (len(token) < 32 or not token.isascii() or any(c.isspace() for c in token)):
                raise ValueError('Configured tokens must be at least 32 non-whitespace ASCII characters')
        if agent_token and (not owner_token or hmac.compare_digest(owner_token, agent_token)):
            raise ValueError('Agent access requires a distinct configured owner token')
        self.owner_token, self.agent_token, self.owner_id = owner_token, agent_token, owner_id

    def __call__(self, authorization: str | None):
        if not self.owner_token:
            raise ServiceError('auth_not_configured', 'Server authentication is not configured', 503)
        value = authorization or ''
        token = value[7:] if value.startswith('Bearer ') else ''
        if not token.isascii():
            raise ServiceError('unauthorized', 'A valid Bearer credential is required', 401)
        if token and hmac.compare_digest(token, self.owner_token):
            return Principal(self.owner_id, 'owner')
        if token and self.agent_token and hmac.compare_digest(token, self.agent_token):
            return Principal(self.owner_id, 'agent')
        raise ServiceError('unauthorized', 'A valid Bearer credential is required', 401)

def require_owner(principal: Principal):
    if principal.role != 'owner':
        raise ServiceError('owner_required', 'Only the human owner can apply, restore or review story changes', 403)
