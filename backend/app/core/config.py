from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "PDF Content Extraction API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Demo credential check for the take-home assignment. Override via
    # environment variables (AUTH_EMAIL / AUTH_PASSWORD) rather than
    # hardcoding real credentials in source control.
    AUTH_EMAIL: str = "demo@comply.com"
    AUTH_PASSWORD: str = "comply2026"

settings = Settings()
