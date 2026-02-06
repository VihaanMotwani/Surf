"""
Local memory module for Surf.

Extracts user-related facts from conversations using LLM,
stores them in SQLite, and provides context for personalization
and knowledge graph visualization — no Zep Cloud required.
"""

import hashlib
import json
import logging
import uuid

from openai import OpenAI
from sqlalchemy import select, func as sa_func

from app.config import settings
from app.db import AsyncSessionLocal
from app.models import Fact

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """\
You are a fact extractor. Given a user message and an assistant response, extract any facts about the user worth remembering for future conversations.

Return a JSON array of objects. Each object has:
- "content": the fact as a short sentence (e.g. "User prefers dark mode")
- "subject": a 2-4 word label for this fact (e.g. "Dark mode")
- "fact_type": one of "preference", "fact", "website", "task", "memory"
- "confidence": float 0-1 indicating confidence this is a real, lasting fact

Only extract facts that are personal to the user (preferences, habits, background, goals, etc.).
Do NOT extract transient conversational details or restate the assistant's response.
If there are no facts to extract, return an empty array: []

User message:
{user_msg}

Assistant response:
{assistant_msg}

JSON array:"""


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.strip().lower().encode()).hexdigest()


async def extract_and_store_facts(
    user_msg: str, assistant_msg: str, session_id: str | None = None
) -> None:
    """
    Call LLM to extract facts from a conversation turn, then upsert into the facts table.
    Designed to be called via asyncio.create_task() (fire-and-forget).
    """
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        prompt = EXTRACTION_PROMPT.format(user_msg=user_msg, assistant_msg=assistant_msg)

        import asyncio
        response = await asyncio.to_thread(
            lambda: client.responses.create(
                model=settings.fact_extraction_model,
                input=[{"role": "user", "content": prompt}],
            )
        )

        raw = getattr(response, "output_text", "[]")
        # Strip markdown fences if present
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        facts = json.loads(raw)
        if not isinstance(facts, list):
            return

        async with AsyncSessionLocal() as db:
            for fact_data in facts:
                content = fact_data.get("content", "").strip()
                if not content:
                    continue

                ch = _content_hash(content)

                # Check for duplicate
                existing = await db.execute(
                    select(Fact).where(Fact.content_hash == ch)
                )
                if existing.scalar_one_or_none():
                    continue

                fact = Fact(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    fact_type=fact_data.get("fact_type", "fact"),
                    content=content,
                    content_hash=ch,
                    subject=fact_data.get("subject", content[:40]),
                    confidence=float(fact_data.get("confidence", 1.0)),
                )
                db.add(fact)

            await db.commit()
            logger.info(f"Extracted and stored {len(facts)} fact(s) from conversation")

    except Exception:
        logger.exception("Error extracting facts from conversation")


async def get_memory_context(limit: int = 20) -> str:
    """
    Query active facts and format them as a context block for the system prompt.
    """
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Fact)
                .where(Fact.is_active == True)
                .order_by(Fact.updated_at.desc())
                .limit(limit)
            )
            facts = result.scalars().all()

        if not facts:
            return ""

        lines = [f"- {f.content}" for f in facts]
        return "Known facts about the user:\n" + "\n".join(lines)

    except Exception:
        logger.exception("Error retrieving local memory context")
        return ""


async def get_local_graph_data(user_name: str = "User") -> dict:
    """
    Build {nodes, edges} from the facts table for knowledge graph visualization.
    """
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Fact)
                .where(Fact.is_active == True)
                .order_by(Fact.updated_at.desc())
                .limit(50)
            )
            facts = result.scalars().all()

        nodes = []
        edges = []

        # Central user node
        user_node = {
            "id": "user_1",
            "label": user_name,
            "type": "user",
            "size": 20,
            "color": "#3b82f6",
        }
        nodes.append(user_node)

        edge_labels = {
            "preference": "has preference",
            "website": "visits",
            "task": "performed",
            "memory": "remembers",
            "fact": "knows",
        }

        color_map = {
            "user": "#3b82f6",
            "preference": "#8b5cf6",
            "website": "#10b981",
            "task": "#f59e0b",
            "memory": "#ec4899",
            "fact": "#6b7280",
        }

        for idx, fact in enumerate(facts):
            node_id = f"fact_{fact.id}"
            node_type = fact.fact_type if fact.fact_type in color_map else "fact"
            nodes.append({
                "id": node_id,
                "label": fact.subject or fact.content[:50],
                "type": node_type,
                "size": 15,
                "color": color_map.get(node_type, "#6b7280"),
                "metadata": {
                    "content": fact.content,
                    "fact_type": fact.fact_type,
                    "confidence": fact.confidence,
                    "created_at": fact.created_at.isoformat() if fact.created_at else None,
                },
            })
            edges.append({
                "id": f"edge_{idx}",
                "source": "user_1",
                "target": node_id,
                "label": edge_labels.get(node_type, "related to"),
                "type": "relationship",
            })

        return {"nodes": nodes, "edges": edges}

    except Exception:
        logger.exception("Error building local graph data")
        return {
            "nodes": [{
                "id": "user_1",
                "label": user_name,
                "type": "user",
                "size": 20,
                "color": "#3b82f6",
                "metadata": {"message": "No knowledge graph data yet. Start chatting to build your memory!"},
            }],
            "edges": [],
        }


async def search_local_facts(query: str, limit: int = 10) -> list[dict]:
    """
    Search facts by keyword using SQLite LIKE.
    Returns a list of GraphNode dicts.
    """
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Fact)
                .where(Fact.is_active == True)
                .where(Fact.content.ilike(f"%{query}%"))
                .order_by(Fact.updated_at.desc())
                .limit(limit)
            )
            facts = result.scalars().all()

        color_map = {
            "preference": "#8b5cf6",
            "website": "#10b981",
            "task": "#f59e0b",
            "memory": "#ec4899",
            "fact": "#6b7280",
        }

        nodes = []
        for idx, fact in enumerate(facts):
            node_type = fact.fact_type if fact.fact_type in color_map else "fact"
            nodes.append({
                "id": f"result_{idx}",
                "label": fact.subject or fact.content[:50],
                "type": node_type,
                "size": 15,
                "color": color_map.get(node_type, "#6b7280"),
                "metadata": {
                    "content": fact.content,
                    "fact_type": fact.fact_type,
                    "confidence": fact.confidence,
                },
            })

        return nodes

    except Exception:
        logger.exception("Error searching local facts")
        return []


async def get_local_graph_stats() -> dict:
    """Return basic stats about the local fact store."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(sa_func.count()).select_from(Fact).where(Fact.is_active == True)
            )
            total = result.scalar() or 0

        return {"total_facts": total, "status": "connected"}

    except Exception:
        logger.exception("Error getting local graph stats")
        return {"total_facts": 0, "status": "error"}
