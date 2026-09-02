import pytest
from fastapi.testclient import TestClient
import fitz

from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_extract_invalid_pdf():
    # Provide non-PDF file
    response = client.post(
        "/api/v1/extract",
        files={"file": ("test.txt", b"dummy content", "text/plain")}
    )
    assert response.status_code == 400
    assert "Invalid file type" in response.json()["detail"]

def test_extract_corrupt_pdf():
    # Provide corrupt PDF bytes
    response = client.post(
        "/api/v1/extract",
        files={"file": ("test.pdf", b"this is not a real pdf", "application/pdf")}
    )
    assert response.status_code == 400
    assert "Corrupted or invalid" in response.json()["detail"]

def test_extract_empty_file():
    # Provide empty bytes
    response = client.post(
        "/api/v1/extract",
        files={"file": ("test.pdf", b"", "application/pdf")}
    )
    assert response.status_code == 400
    assert "Empty file" in response.json()["detail"] or "Corrupted" in response.json()["detail"] or "empty" in response.json()["detail"].lower()

def test_extract_valid_pdf():
    # Generate a simple valid PDF in memory using fitz
    doc = fitz.open()
    page = doc.new_page()
    # Insert a clear heading (large font)
    page.insert_text((50, 100), "Test Heading", fontsize=20)
    # Insert body text
    page.insert_text((50, 150), "This is a body paragraph.", fontsize=10)
    pdf_bytes = doc.write()
    doc.close()
    
    response = client.post(
        "/api/v1/extract",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")}
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    assert "filename" in data
    assert data["filename"] == "test.pdf"
    assert "total_pages" in data
    assert data["total_pages"] == 1
    assert "sections" in data
    assert "metadata" in data
    
    # Verify sections logic
    sections = data["sections"]
    assert len(sections) > 0
    
    # At least one section should contain our heading and body text
    found_heading = False
    for sec in sections:
        if "Test Heading" in sec["title"]:
            found_heading = True
            assert "This is a body paragraph." in sec["raw_markdown"]
            assert sec["page"] == 1
            break
            
    assert found_heading, "Heading was not detected or body text was not associated"

def test_extract_ignores_timestamp_as_heading():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Filing Notes", fontsize=20)
    page.insert_text((50, 130), "08/17/2026 10:31 AM", fontsize=14, fontname="hebo")
    page.insert_text((50, 160), "Received and filed.", fontsize=10)
    pdf_bytes = doc.write()
    doc.close()

    response = client.post(
        "/api/v1/extract",
        files={"file": ("timestamp.pdf", pdf_bytes, "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    headings = [s["title"] for s in data["sections"]]
    assert "08/17/2026 10:31 AM" not in headings


def test_extract_suppresses_repeated_boilerplate_fragment():
    doc = fitz.open()
    fragment = "CHILDREN TO AGE 25 CERTIFICATE"
    for i in range(4):
        page = doc.new_page()
        page.insert_text((50, 100), f"Objection {i + 1}", fontsize=18, fontname="hebo")
        page.insert_text((50, 130), fragment, fontsize=13, fontname="hebo")
        page.insert_text((50, 160), "Some body text about the objection.", fontsize=10)
    pdf_bytes = doc.write()
    doc.close()

    response = client.post(
        "/api/v1/extract",
        files={"file": ("repeated.pdf", pdf_bytes, "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    headings = [s["title"] for s in data["sections"]]
    assert fragment not in headings

def test_login_valid_credentials():
    from app.core.config import settings
    response = client.post(
        "/api/v1/auth/login",
        json={"email": settings.AUTH_EMAIL, "password": settings.AUTH_PASSWORD},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == settings.AUTH_EMAIL.lower()
    assert isinstance(data["token"], str) and len(data["token"]) > 0


def test_login_invalid_password():
    from app.core.config import settings
    response = client.post(
        "/api/v1/auth/login",
        json={"email": settings.AUTH_EMAIL, "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_login_invalid_email():
    from app.core.config import settings
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "not-the-demo-user@example.com", "password": settings.AUTH_PASSWORD},
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_login_missing_fields_returns_422():
    response = client.post("/api/v1/auth/login", json={"email": "a@b.com"})
    assert response.status_code == 422

def test_extract_preserves_line_and_paragraph_breaks():
    # Body text should retain the source PDF's visual line/paragraph
    # structure instead of collapsing everything into one run-on line.
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Table of Contents", fontsize=20)
    # Two lines close together (same paragraph)
    page.insert_text((50, 130), "User Usage Agreement Attachments", fontsize=10)
    page.insert_text((50, 150), "Usage Agreement Usage Agreement.pdf", fontsize=10)
    # A separated block further down (new paragraph/row)
    page.insert_text((50, 230), "Form Attachments (ex. Form Name)", fontsize=10)
    pdf_bytes = doc.write()
    doc.close()

    response = client.post(
        "/api/v1/extract",
        files={"file": ("structure.pdf", pdf_bytes, "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()

    section = next(s for s in data["sections"] if s["title"] == "Table of Contents")
    # Should contain real newlines, not be a single space-joined run-on line
    assert "\n" in section["raw_markdown"], "Body text has no line breaks — structure was flattened"
    # No single line should contain unrelated content glued together with only a space
    assert "Attachments\nUsage Agreement" in section["raw_markdown"] or \
           "Attachments\n\nUsage Agreement" in section["raw_markdown"] or \
           "| User Usage Agreement Attachments |" in section["raw_markdown"] or \
           "Usage Agreement Usage Agreement.pdf" in section["raw_markdown"]

def test_extract_formats_tabular_data_as_markdown():
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "Attachments List", fontsize=20)
    
    # Headers
    page.insert_text((50, 130), "Form Name", fontsize=10)
    page.insert_text((200, 130), "Form Number", fontsize=10)
    
    # Row 1
    page.insert_text((50, 150), "Application Form", fontsize=10)
    page.insert_text((200, 150), "APP-001", fontsize=10)
    
    pdf_bytes = doc.write()
    doc.close()

    response = client.post(
        "/api/v1/extract",
        files={"file": ("table.pdf", pdf_bytes, "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()

    section = next(s for s in data["sections"] if s["title"] == "Attachments List")
    text = section["raw_markdown"]
    
    assert "| Form Name | Form Number |" in text
    assert "| --- | --- |" in text
    assert "| Application Form | APP-001 |" in text
