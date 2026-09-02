from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict


class ContentBlock(BaseModel):
    """A typed layout block. Only fields relevant to `type` are populated."""

    type: Literal["heading", "paragraph", "table", "key_value", "list"]
    # heading: 1 is highest; larger numbers are nested
    level: Optional[int] = Field(default=None, ge=1, le=6)
    # heading, paragraph
    text: Optional[str] = None
    # table
    headers: Optional[List[str]] = None
    rows: Optional[List[List[str]]] = None
    # key_value: {"label", "value"}; list: {"text"}
    items: Optional[List[Dict[str, str]]] = None


class Page(BaseModel):
    page_number: int
    blocks: List[ContentBlock]


class FileSummary(BaseModel):
    state: Optional[str] = None
    filing_company: Optional[str] = None
    toi_sub_toi: Optional[str] = None
    product_name: Optional[str] = None
    project_name_number: Optional[str] = None
    company_tracking_number: Optional[str] = None
    serff_tracking_number: Optional[str] = None
    state_tracking_number: Optional[str] = None


class TableBlock(BaseModel):
    headers: Optional[List[str]] = None
    rows: List[List[str]] = Field(default_factory=list)


class KeyValueItem(BaseModel):
    key: str
    value: str
    label: Optional[str] = None


class DocumentSection(BaseModel):
    id: Optional[str] = None
    title: str
    level: int = 1
    page_number: int = 1
    paragraphs: List[str] = Field(default_factory=list)
    key_values: List[KeyValueItem] = Field(default_factory=list)
    tables: List[TableBlock] = Field(default_factory=list)
    lists: List[List[str]] = Field(default_factory=list)
    subsections: List["DocumentSection"] = Field(default_factory=list)


class StructuredDocument(BaseModel):
    title: str
    metadata: Dict[str, Optional[str]] = Field(default_factory=dict)
    sections: List[DocumentSection] = Field(default_factory=list)


class ExtractionMetadata(BaseModel):
    processing_time_ms: int
    heading_count: int
    character_count: int


class ExtractionResponse(BaseModel):
    filename: str
    total_pages: int
    file_summary: FileSummary
    document: StructuredDocument
    pages: List[Page]
    metadata: ExtractionMetadata


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    email: str
    token: str

