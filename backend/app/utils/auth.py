import hashlib
import hmac
from urllib.parse import unquote
import json
import logging

logger = logging.getLogger(__name__)
from app.core.config import settings

def has_correct_hash(*, init_data: str) -> bool:
    try:
        decoded_init_data = unquote(init_data)
        logger.debug(f"Raw decoded_init_data: {decoded_init_data}")
        params = {}
        for pair in decoded_init_data.split('&'):
            if '=' in pair:
                key, value = pair.split('=', 1)
                params[key] = value
        logger.debug(f"Parsed params: {params}")
        
        received_hash = params.get("hash")  # Telegram использует "hash", а не "signature"
        if not received_hash:
            logger.warning("No hash found in initData")
            return False
        
        # Удаляем hash из параметров и сортируем остальные
        data_check_pairs = [f"{k}={v}" for k, v in sorted(params.items()) if k != "hash"]
        data_check_string = "\n".join(data_check_pairs)
        logger.debug(f"Data check string: {data_check_string}")
        
        if not settings.BOT_TOKEN:
            logger.error("BOT_TOKEN is missing or empty")
            return False
        
        # Создаём секретный ключ
        secret_key = hmac.new(b"WebAppData", settings.BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
        logger.debug(f"Calculated hash: {calculated_hash}, Received hash: {received_hash}")
        
        # Сравниваем хэши
        if calculated_hash != received_hash:
            logger.error("Hashes do not match")
            return False
        
        logger.info("Hash verification successful")
        return True
    except Exception as e:
        logger.error(f"Error in has_correct_hash: {str(e)}")
        return False

def parse_telegram_init_data(*, init_data: str) -> dict:
    try:
        decoded_init_data = unquote(init_data)
        params = {k: v for k, v in [pair.split('=', 1) for pair in decoded_init_data.split('&') if '=' in pair]}
        user_data = json.loads(params.get("user", "{}"))
        return {
            "user_id": user_data.get("id"),
            "username": user_data.get("username", ""),
            "first_name": user_data.get("first_name", ""),
            "photo_url": user_data.get("photo_url", ""),
            "start_param": params.get("start_param", "")  # Добавляем start_param
        }
    except Exception as e:
        logger.error(f"Error in parse_telegram_init_data: {str(e)}")
        return {}