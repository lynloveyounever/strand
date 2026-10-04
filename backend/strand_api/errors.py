class ServiceError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra

    def detail(self):
        return {"code": self.code, "message": self.message, **self.extra}
