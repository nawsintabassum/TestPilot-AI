from pydantic import BaseModel, Field, ConfigDict

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    source_code: str = Field(default="", max_length=100000)
    test_code: str = Field(default="", max_length=100000)

class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    source_code: str | None = Field(default=None, max_length=100000)
    test_code: str | None = Field(default=None, max_length=100000)

class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    source_code: str
    test_code: str

class ValidateRequest(BaseModel):
    source_code: str = Field(max_length=100000)
    test_code: str = Field(max_length=100000)
