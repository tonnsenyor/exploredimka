from fastapi import Depends, Request, HTTPException
from app.utils.auth import has_correct_hash, parse_telegram_init_data
import logging

logger = logging.getLogger(__name__)

async def verify_authorization(request: Request):
    if request.method == "OPTIONS":
        logger.info("Skipping authorization for OPTIONS request")
        return {}
    auth_header = request.headers.get("Authorization")
    logger.info(f"Received Authorization header: {auth_header}")
    if not auth_header or not auth_header.startswith("tma "):
        logger.error("Invalid Authorization header")
        raise HTTPException(status_code=400, detail="Invalid Authorization header. Use 'tma <initData>'")
    init_data = auth_header.split(" ")[1]
    logger.info(f"Extracted init_data: {init_data[:50]}...")
    if not init_data:
        logger.error("Missing initData")
        raise HTTPException(status_code=400, detail="initData is required")
    if not has_correct_hash(init_data=init_data):
        logger.error("Authentication failed due to incorrect hash")
        raise HTTPException(status_code=400, detail="Authentication failed")
    user_data = parse_telegram_init_data(init_data=init_data)
    logger.info(f"Parsed user_data: {user_data}")
    if not user_data or not user_data.get("user_id"):
        logger.error(f"Invalid or missing Telegram data: {user_data}")
        raise HTTPException(status_code=400, detail="Invalid Telegram data")
    return user_data