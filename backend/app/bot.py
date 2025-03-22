from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    referrer_id = None
    if args and args[0].startswith("ref_"):
        referrer_id = args[0].replace("ref_", "")
    user_id = update.message.from_user.id
    web_app_url = f"https://laboratory-front.vercel.app"  # Базовый URL Mini App
    await update.message.reply_text(
        "Welcome! Click below to join:",
        reply_markup={"inline_keyboard": [[{"text": "Open App", "web_app": {"url": web_app_url}}]]}
    )
    # Если есть referrer_id, он уже передан через startapp, так что бот просто открывает Mini App

application = Application.builder().token("YOUR_BOT_TOKEN").build()
application.add_handler(CommandHandler("start", start))
application.run_polling()