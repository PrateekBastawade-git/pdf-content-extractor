from pydantic import BaseModel
from typing import List, Optional, Literal, Dict

class ContentBlock(BaseModel):
    type: Literal["paragraph", "table", "key_value", "list", "subheading", "key_value_grid"]
    title: Optional[str] = None
    headers: Optional[List[str]] = None
    rows: Optional[List[List[str]]] = None
    items: Optional[List[Dict[str, str]]] = None
    raw_markdown: str

class Section(BaseModel):
    id: str
    title: str
    page: int
    blocks: List[ContentBlock]
    raw_markdown: str

class FileSummary(BaseModel):
    state: Optional[str] = None
    filing_company: Optional[str] = None
    toi_sub_toi: Optional[str] = None
    product_name: Optional[str] = None
    project_name_number: Optional[str] = None
    company_tracking_number: Optional[str] = None
    serff_tracking_number: Optional[str] = None
    state_tracking_number: Optional[str] = None

class ExtractionMetadata(BaseModel):
    processing_time_ms: int
    heading_count: int
    character_count: int

class ExtractionResponse(BaseModel):
    filename: str
    total_pages: int
    file_summary: FileSummary
    sections: List[Section]
    metadata: ExtractionMetadata

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    email: str
    token: str
