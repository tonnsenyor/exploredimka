from pydantic_settings import BaseSettings
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    BOT_TOKEN: str
    TON_API_KEY: str
    BOT_NAME: str 
    SUPABASE_SERVICE_KEY: str
    

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()

# Логируем загрузку BOT_TOKEN
logger.info(f"Loaded BOT_TOKEN: {settings.BOT_TOKEN[:5]}... (first 5 chars for security)")