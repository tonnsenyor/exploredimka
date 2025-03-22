import requests
import logging

logger = logging.getLogger(__name__)
from app.core.config import settings

def get_ton_balance(wallet_address: str):
    url = f"https://toncenter.com/api/v2/getAddressBalance"
    params = {"address": wallet_address, "api_key": settings.TON_API_KEY}
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get("result", 0)
    logger.error(f"Failed to get TON balance: {response.text}")
    return 0