from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.deps import verify_authorization
from app.core.config import settings
from app.core.database import supabase, supabase_service
from datetime import datetime, timezone, timedelta
import logging
import requests

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response

@app.get("/")
async def root():
    return {"message": "Welcome to Sbank API"}

def get_ton_balance(wallet_address: str):
    url = f"https://toncenter.com/api/v2/getAddressBalance"
    params = {"address": wallet_address, "api_key": settings.TON_API_KEY}
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json().get("result", 0)
    logger.error(f"Failed to get TON balance for {wallet_address}: {response.status_code} - {response.text}")
    raise HTTPException(status_code=503, detail="Failed to fetch TON balance")

@app.post("/api/v1/auth/login")
async def login(user_data: dict = Depends(verify_authorization)):
    user_id = user_data["user_id"]
    logger.info(f"Authenticating user_id: {user_id}")

    try:
        user_response = supabase.table("users").select("*").eq("user_id", user_id).execute()
        user_id_fk = None
        if not user_response.data:
            new_user = {
                "user_id": user_id,
                "username": user_data.get("username", ""),
                "first_name": user_data.get("first_name", ""),
                "photo_url": user_data.get("photo_url", "")
            }
            insert_result = supabase_service.table("users").insert(new_user).execute()
            user_id_fk = insert_result.data[0]["id"]
            supabase_service.table("offchain_points").insert({
                "user_id": user_id,
                "user_id_fk": user_id_fk,
                "points": 0,
                "tickets": 0,
                "hearts": 0,
                "energy": 100,
                "max_energy": 100,
                "last_energy_update": "now()",
                "last_claim_date": None,
                "claim_streak": 0
            }).execute()
        else:
            user_id_fk = user_response.data[0]["id"]

        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=500, detail="Failed to initialize user points")
        
        user_points = points_response.data[0]
        start_param = user_data.get("start_param", "")
        logger.info(f"Received start_param: {start_param}")
        if start_param and start_param.startswith("ref_"):
            referrer_id = start_param.replace("ref_", "")
            await register_referral_logic(user_id, referrer_id, user_data, user_id_fk)

        logger.info(f"Login successful for user_id: {user_id}")
        return {
            "user": user_data,
            "points": {
                "points": user_points["points"],
                "tickets": user_points["tickets"],
                "hearts": user_points["hearts"],
                "energy": user_points["energy"]
            }
        }
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/webhook")
async def webhook(request: Request):
    data = await request.json()
    logger.info(f"Received webhook data: {data}")
    user_id = data.get("user_id")
    if not user_id:
        logger.error("Missing user_id in webhook data")
        return {"status": "error", "message": "Missing user_id"}
    try:
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            user = supabase.table("users").select("id").eq("user_id", user_id).execute()
            user_id_fk = user.data[0]["id"] if user.data else None
            if user_id_fk:
                supabase_service.table("offchain_points").insert({
                    "user_id": user_id,
                    "user_id_fk": user_id_fk,
                    "points": 0,
                    "tickets": 0,
                    "hearts": 0,
                    "energy": 100,
                    "max_energy": 100,
                    "last_energy_update": "now()",
                    "last_claim_date": None,
                    "claim_streak": 0
                }).execute()
                points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        current_points = points_response.data[0]["points"]
        current_tickets = points_response.data[0]["tickets"]
        event = data.get("event")
        if event == "login":
            logger.info(f"Login event processed for user_id: {user_id}")
        return {"status": "processed", "points": current_points, "tickets": current_tickets}
    except Exception as e:
        logger.error(f"Error in webhook: {str(e)}")
        return {"status": "error", "message": str(e)}

@app.post("/api/v1/claim_daily_points/{user_id}")
async def claim_daily_points(user_id: int, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=404, detail="User points not found")
        
        user_points = points_response.data[0]
        last_claim = user_points["last_claim_date"]
        current_time = datetime.now(timezone.utc)
        
        if last_claim:
            last_claim_time = datetime.fromisoformat(last_claim.replace("Z", "+00:00"))
            if (current_time - last_claim_time).total_seconds() < 24 * 3600:
                raise HTTPException(status_code=400, detail="Claim available only once every 24 hours")
        
        claim_streak = user_points["claim_streak"]
        if last_claim and (current_time - last_claim_time).total_seconds() < 48 * 3600:
            claim_streak = min(claim_streak + 1, 7)
        else:
            claim_streak = 1
        
        new_tickets = user_points["tickets"] + claim_streak
        
        try:
            supabase_service.table("offchain_points").update({
                "tickets": new_tickets,
                "last_claim_date": current_time.isoformat(),
                "claim_streak": claim_streak
            }).eq("user_id", user_id).execute()
        except Exception as e:
            logger.error(f"Failed to update points: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to update user points")

        logger.info(f"Claimed {claim_streak} tickets for user_id {user_id}, streak: {claim_streak}")
        return {
            "message": "Daily claim successful",
            "tickets": new_tickets,
            "streak": claim_streak
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in claim_daily_points: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/v1/claim_daily_points/{user_id}")
async def get_claim_status(user_id: int, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=404, detail="User points not found")
        
        user_points = points_response.data[0]
        last_claim = user_points["last_claim_date"]
        current_time = datetime.now(timezone.utc)
        next_claim_time = None
        
        if last_claim:
            last_claim_time = datetime.fromisoformat(last_claim.replace("Z", "+00:00"))
            if (current_time - last_claim_time).total_seconds() < 24 * 3600:
                next_claim_time = last_claim_time + timedelta(hours=24)
        
        return {
            "streak": user_points["claim_streak"],
            "nextClaimTimestamp": next_claim_time.isoformat() if next_claim_time else None
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in get_claim_status: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/v1/wallet/connect")
async def wallet_connect(data: dict, user_data: dict = Depends(verify_authorization)):
    logger.info(f"Connecting wallet for user_id: {user_data.get('user_id')}")
    wallet_address = data.get("wallet", "mock_wallet")
    user_id = user_data["user_id"]
    ton_balance = get_ton_balance(wallet_address) if wallet_address != "mock_wallet" else 0
    try:
        supabase_service.table("users").update({"wallet": wallet_address}).eq("user_id", user_id).execute()
    except Exception as e:
        logger.error(f"Failed to update wallet: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update wallet")
    return {"wallet_address": wallet_address, "ton_balance": ton_balance, "spermbank_balance": 0}

@app.get("/api/v1/referrals/invite-link")
async def get_invite_link(user_id: int, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    bot_name = settings.BOT_NAME
    invite_link = f"https://t.me/{bot_name}/lab?startapp=ref_{user_id}"
    logger.info(f"Generated invite link for user_id {user_id}: {invite_link}")
    return {"url": invite_link}

async def register_referral_logic(user_id: int, referrer_id: str, user_data: dict, user_id_fk: int):
    logger.info(f"Registering referral: user_id={user_id}, referrer_id={referrer_id}")

    try:
        referral_check = supabase.table("referrals").select("*").eq("referral_id", user_id_fk).execute()
        if referral_check.data:
            logger.info(f"User {user_id} already has a referrer")
            return {"message": "User already has a referrer"}

        referrer_id_int = int(referrer_id)
        if referrer_id_int == user_id:
            logger.warning(f"User {user_id} cannot refer themselves")
            return {"message": "Cannot refer yourself"}

        referrer_user = supabase.table("users").select("id").eq("user_id", referrer_id_int).execute()
        if not referrer_user.data:
            logger.warning(f"Referrer {referrer_id} not found")
            return {"message": "Invalid referrer"}

        referrals_count = supabase.table("referrals").select("*").eq("referrer_id", referrer_user.data[0]["id"]).execute()
        if len(referrals_count.data) >= 10:
            logger.warning(f"Referrer {referrer_id} has reached max referrals (10)")
            return {"message": "Referrer has reached maximum referral limit"}

        referrer_response = supabase.table("offchain_points").select("*").eq("user_id", referrer_id_int).execute()
        if referrer_response.data:
            current_tickets = referrer_response.data[0]["tickets"]
            try:
                supabase_service.table("offchain_points").update({
                    "tickets": current_tickets + 10
                }).eq("user_id", referrer_id_int).execute()
            except Exception as e:
                logger.error(f"Failed to update referrer tickets: {str(e)}")
                raise HTTPException(status_code=500, detail="Failed to update referrer points")

            referrer_user_id = referrer_user.data[0]["id"]
            try:
                supabase_service.table("referrals").insert({
                    "referrer_id": referrer_user_id,
                    "referral_id": user_id_fk
                }).execute()
            except Exception as e:
                logger.error(f"Failed to insert referral: {str(e)}")
                raise HTTPException(status_code=500, detail="Failed to register referral")
            logger.info(f"Added 10 tickets to referrer {referrer_id}")
        else:
            logger.warning(f"Referrer {referrer_id} not found")

        logger.info(f"Referral registered successfully for user_id {user_id}")
        return {"message": "Referral registered successfully"}
    except Exception as e:
        logger.error(f"Error in register_referral_logic: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/v1/referrals/register")
async def register_referral(data: dict, user_data: dict = Depends(verify_authorization)):
    user_id = user_data["user_id"]
    referrer_id = data.get("referrer_id")
    
    user_response = supabase.table("users").select("id").eq("user_id", user_id).execute()
    if not user_response.data:
        raise HTTPException(status_code=404, detail="User not found")
    user_id_fk = user_response.data[0]["id"]

    return await register_referral_logic(user_id, referrer_id, user_data, user_id_fk)

@app.get("/api/v1/referrals")
async def get_referrals(user_id: int, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    try:
        referrer = supabase.table("users").select("id").eq("user_id", user_id).execute()
        if not referrer.data:
            return {"referrals": []}
        referrer_id = referrer.data[0]["id"]

        referrals_response = supabase.table("referrals").select("referral_id").eq("referrer_id", referrer_id).execute()
        if not referrals_response.data:
            return {"referrals": []}

        referral_ids = [r["referral_id"] for r in referrals_response.data]
        users_response = supabase.table("users").select("user_id, username, first_name, photo_url").in_("id", referral_ids).execute()
        
        logger.info(f"Retrieved {len(users_response.data)} referrals for user_id {user_id}")
        return {"referrals": users_response.data if users_response.data else []}
    except Exception as e:
        logger.error(f"Error in get_referrals: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/v1/add")
async def add_points(data: dict, user_data: dict = Depends(verify_authorization)):
    user_id = user_data["user_id"]
    points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
    if not points_response.data:
        raise HTTPException(status_code=404, detail="User points not found")
    current_points = points_response.data[0]["points"]
    current_tickets = points_response.data[0]["tickets"]
    try:
        supabase_service.table("offchain_points").update({
            "points": current_points + 1000
        }).eq("user_id", user_id).execute()
    except Exception as e:
        logger.error(f"Failed to update points: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update points")
    return {"points": {"points": current_points + 1000, "tickets": current_tickets}}

@app.post("/api/v1/mini_tap")
async def mini_tap(user_data: dict = Depends(verify_authorization)):
    user_id = user_data["user_id"]
    logger.info(f"Processing mini tap for user_id: {user_id}")

    try:
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=404, detail="User points not found")
        
        user_points = points_response.data[0]
        current_energy = user_points["energy"]
        current_hearts = user_points["hearts"]
        max_energy = user_points["max_energy"]
        last_update = user_points["last_energy_update"]

        # Проверяем и корректируем last_energy_update, если он некорректен
        if not last_update or last_update == "now()":
            last_update = datetime.now(timezone.utc).isoformat()
            supabase_service.table("offchain_points").update({
                "last_energy_update": last_update
            }).eq("user_id", user_id).execute()
            logger.warning(f"Corrected invalid last_energy_update for user_id: {user_id}")

        # Преобразуем last_update в datetime
        try:
            last_update_time = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
        except ValueError:
            last_update_time = datetime.now(timezone.utc) - timedelta(minutes=5)  # Даём 5 минут энергии
            last_update = last_update_time.isoformat()
            supabase_service.table("offchain_points").update({
                "last_energy_update": last_update
            }).eq("user_id", user_id).execute()
            logger.warning(f"Invalid last_energy_update format corrected for user_id: {user_id}")

        # Расчёт восстановления энергии
        current_time = datetime.now(timezone.utc)
        elapsed_minutes = (current_time - last_update_time).total_seconds() / 60
        energy_to_restore = int(elapsed_minutes / 5)  # +1 энергия каждые 5 минут
        restored_energy = min(max_energy, current_energy + energy_to_restore)

        # Проверяем энергию перед тапом
        if restored_energy < 1:
            raise HTTPException(status_code=400, detail="Not enough energy")

        # Выполняем тап
        new_energy = restored_energy - 1
        new_hearts = current_hearts + 1

        # Обновляем данные
        supabase_service.table("offchain_points").update({
            "hearts": new_hearts,
            "energy": new_energy,
            "last_energy_update": current_time.isoformat()
        }).eq("user_id", user_id).execute()
        
        logger.info(f"Mini tap: user_id={user_id}, hearts={new_hearts}, energy={new_energy}, restored={restored_energy}")
        return {
            "message": "Mini tap successful",
            "hearts": new_hearts,
            "energy": new_energy
        }
    except Exception as e:
        logger.error(f"Error in mini_tap: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Обновление энергии
@app.get("/api/v1/update_energy/{user_id}")
async def update_energy(user_id: int, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    try:
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=404, detail="User points not found")
        
        user_points = points_response.data[0]
        current_energy = user_points["energy"]
        max_energy = user_points["max_energy"]
        last_update = user_points["last_energy_update"]

        current_time = datetime.now(timezone.utc)
        last_update_time = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
        elapsed_minutes = (current_time - last_update_time).total_seconds() / 60
        energy_to_restore = int(elapsed_minutes / 5)
        new_energy = min(max_energy, current_energy + energy_to_restore)

        supabase_service.table("offchain_points").update({
            "energy": new_energy,
            "last_energy_update": current_time.isoformat()
        }).eq("user_id", user_id).execute()

        logger.info(f"Energy updated for user_id={user_id}, new_energy={new_energy}")
        return {"energy": new_energy}
    except Exception as e:
        logger.error(f"Error in update_energy: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Проверка статуса задания
@app.get("/api/v1/task_status/{user_id}/{task_id}")
async def get_task_status(user_id: int, task_id: str, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        task_response = supabase.table("completed_tasks").select("*").eq("user_id", user_id).eq("task_id", task_id).execute()
        if task_response.data:
            return {"completed": True, "completed_at": task_response.data[0]["completed_at"]}
        return {"completed": False}
    except Exception as e:
        logger.error(f"Error in get_task_status: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Выполнение задания и начисление очков
@app.post("/api/v1/complete_task/{user_id}/{task_id}")
async def complete_task(user_id: int, task_id: str, user_data: dict = Depends(verify_authorization)):
    if user_id != user_data["user_id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        # Проверяем, выполнил ли пользователь задание
        task_response = supabase.table("completed_tasks").select("*").eq("user_id", user_id).eq("task_id", task_id).execute()
        if task_response.data:
            raise HTTPException(status_code=400, detail="Task already completed")

        # Получаем текущие очки пользователя
        points_response = supabase.table("offchain_points").select("*").eq("user_id", user_id).execute()
        if not points_response.data:
            raise HTTPException(status_code=404, detail="User points not found")

        user_points = points_response.data[0]
        current_points = user_points["points"]

        # Начисляем 1000 $LABS (Airdrop Points)
        new_points = current_points + 1000

        # Обновляем очки
        supabase_service.table("offchain_points").update({
            "points": new_points
        }).eq("user_id", user_id).execute()

        # Отмечаем задание как выполненное
        supabase_service.table("completed_tasks").insert({
            "user_id": user_id,
            "task_id": task_id
        }).execute()

        logger.info(f"Task {task_id} completed for user_id {user_id}, new points: {new_points}")
        return {
            "message": "Task completed successfully",
            "points": new_points
        }
    except Exception as e:
        logger.error(f"Error in complete_task: {str(e)}")
        if "duplicate key" in str(e).lower():
            raise HTTPException(status_code=400, detail="Task already completed")
        raise HTTPException(status_code=500, detail="Internal server error")