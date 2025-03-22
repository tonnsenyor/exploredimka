from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)  # Для SELECT

if settings.SUPABASE_SERVICE_KEY:
    supabase_service: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)  # Для INSERT/UPDATE
else:
    logger.warning("SUPABASE_SERVICE_KEY not found. Using supabase for all operations.")
    supabase_service = supabase  # Фallback на supabase, если service_key отсутствует