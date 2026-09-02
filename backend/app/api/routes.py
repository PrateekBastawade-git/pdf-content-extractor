from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models.schemas import ExtractionResponse, LoginRequest, LoginResponse
from app.services.pdf_extractor import extract_pdf_content
from app.core.config import settings
import fitz
import hmac
import secrets

router = APIRouter()

@router.post("/auth/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    email_ok = hmac.compare_digest(credentials.email.strip().lower(), settings.AUTH_EMAIL.lower())
    password_ok = hmac.compare_digest(credentials.password, settings.AUTH_PASSWORD)

    if not (email_ok and password_ok):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Issue a simple opaque session token. Not a JWT — sufficient for this
    # assignment's scope (single demo user, no roles/expiry requirements).
    token = secrets.token_urlsafe(32)
    return LoginResponse(email=credentials.email.strip().lower(), token=token)

@router.post("/extract", response_model=ExtractionResponse, response_model_exclude_none=True)
async def extract_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDFs are supported.")

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file")

        return extract_pdf_content(contents, file.filename)
    except HTTPException:
        raise
    except fitz.FileDataError:
        raise HTTPException(status_code=400, detail="Corrupted or invalid PDF file.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
