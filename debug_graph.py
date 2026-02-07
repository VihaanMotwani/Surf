
import asyncio
import os
import sys
from dotenv import load_dotenv
from pprint import pprint

# Load env before importing app modules
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.memory import create_memory
from app.config import settings

async def analyze_graph():
    print("Initializing Zep memory...")
    memory = create_memory(
        api_key=settings.zep_api_key,
        user_id=settings.zep_user_id or "surf_user",
        user_name=settings.zep_user_name or "User",
    )
    
    if not memory:
        print("Failed to initialize memory. Check ZEP_API_KEY.")
        return

    print(f"\nFetching graph data for user: {memory.user_id}")
    
    try:
        # Fetch nodes and edges
        # Note: The exact API might differ, adjusting based on memory.py usage
        # memory.py uses: memory.client.graph.search(...)
        # Let's try to search for everything
        
        results = memory.client.graph.search(
            user_id=memory.user_id,
            query="everything", 
            limit=50
        )
        
        print(f"\n--- Graph Search Results ({len(results.edges) if hasattr(results, 'edges') else 0} edges) ---")
        if hasattr(results, 'edges'):
             for i, edge in enumerate(results.edges):
                try:
                    # Try to get source/target from typical Zep attributes
                    src = getattr(edge, 'source_node_uuid', 'unknown_src')
                    tgt = getattr(edge, 'target_node_uuid', 'unknown_tgt')
                    rel = getattr(edge, 'relation_name', getattr(edge, 'relation', 'unknown_rel'))
                    print(f"[{i}] {src} -> {rel} -> {tgt}")
                    print(f"    Raw: {edge}")
                except Exception as e:
                    print(f"[{i}] Error printing edge: {e}")
                    print(f"    Dir: {dir(edge)}")
                
        # Also try to get all episodes/facts if possible
        # memory.py doesn't show a 'get_all' method, but we can try to infer from Zep client
        
    except Exception as e:
        print(f"Error fetching graph: {e}")

if __name__ == "__main__":
    asyncio.run(analyze_graph())
