
import asyncio
import os
import sys
from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))
# Fix database path for script running in root
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(os.getcwd(), 'backend', 'surf.db')}"
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.memory import create_memory
from app.config import settings

async def purge_memory():
    print("Initializing Zep memory...")
    memory = create_memory(
        api_key=settings.zep_api_key,
        user_id=settings.zep_user_id or "surf_user",
        user_name=settings.zep_user_name or "User",
    )
    
    if not memory:
        print("Failed to initialize memory.")
        return

    print(f"WARNING: This will delete ALL memory for user: {memory.user_id}")
    print("This includes Zep Cloud memory AND local database facts (surf.db).")
    confirm = input("Type 'DELETE' to confirm: ")
    
    if confirm == "DELETE":
        try:
            # 1. Delete Zep User
            print(f"Deleting Zep user {memory.user_id}...")
            try:
                memory.client.user.delete(memory.user_id)
                print("Zep user deleted.")
            except Exception as e:
                print(f"Error deleting Zep user (might not exist): {e}")
            
            # Recreate Zep user
            print("Recreating empty Zep user profile...")
            memory._ensure_user_exists()
            
            # 2. Delete Local Facts
            print("Deleting local facts from surf.db...")
            from app.db import AsyncSessionLocal
            from app.models import Fact
            from sqlalchemy import delete
            
            async with AsyncSessionLocal() as db:
                await db.execute(delete(Fact))
                await db.commit()
            print("Local facts deleted.")
            
            print("Done. Memory is now clean.")
            
        except Exception as e:
            print(f"Error purging memory: {e}")
    else:
        print("Operation cancelled.")

if __name__ == "__main__":
    asyncio.run(purge_memory())
