from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

USERS = {
    "admin": {"password": os.environ.get("ADMIN_PASSWORD", "admin123"), "role": "admin"},
    "staff": {"password": os.environ.get("STAFF_PASSWORD", "staff123"), "role": "staff"}
}

# Print page storage (server-side print for Electron compatibility)
print_pages = {}
