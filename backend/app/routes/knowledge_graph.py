"""
Knowledge Graph API routes for Surf.
Exposes Zep knowledge graph data to the Electron frontend.
"""

import os
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.memory import get_memory_client

router = APIRouter(prefix="/api/graph", tags=["knowledge-graph"])


# Pydantic models
class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    x: Optional[float] = None
    y: Optional[float] = None
    size: Optional[float] = None
    color: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    type: Optional[str] = None


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class SearchQuery(BaseModel):
    query: str
    limit: Optional[int] = 10


class SearchResult(BaseModel):
    nodes: List[GraphNode]
    message: Optional[str] = None


@router.get("", response_model=GraphData)
async def get_knowledge_graph():
    """
    Retrieve the complete knowledge graph for the current user from Zep.

    Returns nodes and edges representing the user's knowledge graph.
    """
    try:
        memory = get_memory_client()

        # Search the knowledge graph for all episodes/facts
        # Zep requires a non-empty query and max 50 items
        search_results = memory.client.graph.search(
            user_id=memory.user_id,
            query="*",  # Wildcard query to match all
            limit=50
        )

        nodes = []
        edges = []
        node_ids = set()

        # Convert Zep episodes to graph nodes
        if hasattr(search_results, 'episodes') and search_results.episodes:
            for idx, episode in enumerate(search_results.episodes):
                # Create node for each episode/fact
                node_id = f"episode_{idx}"

                # Extract content and metadata
                content = episode.content if hasattr(episode, 'content') else str(episode)
                episode_type = episode.type if hasattr(episode, 'type') else "fact"

                # Determine node type based on content
                node_type = _classify_node_type(content, episode_type)

                node = GraphNode(
                    id=node_id,
                    label=_extract_label(content),
                    type=node_type,
                    size=15,
                    color=_get_node_color(node_type),
                    metadata={
                        "content": content,
                        "created_at": episode.created_at if hasattr(episode, 'created_at') else None,
                        "episode_type": episode_type
                    }
                )
                nodes.append(node)
                node_ids.add(node_id)

                # Create edge to user node
                if idx == 0:
                    # Add central user node
                    user_node = GraphNode(
                        id="user_1",
                        label=os.environ.get("ZEP_USER_NAME", "User"),
                        type="user",
                        size=20,
                        color="#3b82f6"
                    )
                    nodes.insert(0, user_node)
                    node_ids.add("user_1")

                # Create edge from user to this episode
                edge = GraphEdge(
                    id=f"edge_{idx}",
                    source="user_1",
                    target=node_id,
                    label=_get_edge_label(node_type),
                    type="relationship"
                )
                edges.append(edge)

        # If no data from Zep, return empty graph with just user node
        if not nodes:
            user_node = GraphNode(
                id="user_1",
                label=os.environ.get("ZEP_USER_NAME", "User"),
                type="user",
                size=20,
                color="#3b82f6",
                metadata={"message": "No knowledge graph data yet. Start using Surf to build your memory!"}
            )
            nodes.append(user_node)

        return GraphData(nodes=nodes, edges=edges)

    except Exception as e:
        print(f"[KG] Error fetching graph: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch knowledge graph: {str(e)}")


@router.post("/search", response_model=SearchResult)
async def search_knowledge_graph(search: SearchQuery):
    """
    Search the knowledge graph using natural language query.

    Uses Zep's semantic search to find relevant nodes.
    """
    try:
        memory = get_memory_client()

        # Use Zep's semantic search
        search_results = memory.client.graph.search(
            user_id=memory.user_id,
            query=search.query,
            limit=search.limit or 10
        )

        nodes = []

        if hasattr(search_results, 'episodes') and search_results.episodes:
            for idx, episode in enumerate(search_results.episodes):
                node_id = f"result_{idx}"
                content = episode.content if hasattr(episode, 'content') else str(episode)
                episode_type = episode.type if hasattr(episode, 'type') else "fact"
                node_type = _classify_node_type(content, episode_type)

                node = GraphNode(
                    id=node_id,
                    label=_extract_label(content),
                    type=node_type,
                    size=15,
                    color=_get_node_color(node_type),
                    metadata={
                        "content": content,
                        "score": episode.score if hasattr(episode, 'score') else None,
                        "episode_type": episode_type
                    }
                )
                nodes.append(node)

        message = f"Found {len(nodes)} results" if nodes else "No results found"

        return SearchResult(nodes=nodes, message=message)

    except Exception as e:
        print(f"[KG] Error searching graph: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/stats")
async def get_graph_stats():
    """Get statistics about the knowledge graph."""
    try:
        memory = get_memory_client()

        # Get recent facts
        # Zep requires a non-empty query and max 50 items
        search_results = memory.client.graph.search(
            user_id=memory.user_id,
            query="*",
            limit=50
        )

        total_facts = len(search_results.episodes) if hasattr(search_results, 'episodes') else 0

        return {
            "user_id": memory.user_id,
            "total_facts": total_facts,
            "status": "connected"
        }
    except Exception as e:
        print(f"[KG] Error getting stats: {e}")
        return {
            "user_id": os.environ.get("ZEP_USER_ID", "unknown"),
            "total_facts": 0,
            "status": "error",
            "error": str(e)
        }


# Helper functions
def _classify_node_type(content: str, episode_type: str) -> str:
    """Classify the type of node based on content."""
    content_lower = content.lower()

    if "preference" in content_lower or "likes" in content_lower or "prefers" in content_lower:
        return "preference"
    elif any(domain in content_lower for domain in [".com", ".org", "http", "website", "url"]):
        return "website"
    elif any(word in content_lower for word in ["task", "action", "completed", "did"]):
        return "task"
    elif "remember" in content_lower or "memory" in content_lower:
        return "memory"
    else:
        return "fact"


def _extract_label(content: str, max_length: int = 50) -> str:
    """Extract a short label from content."""
    if len(content) <= max_length:
        return content
    return content[:max_length] + "..."


def _get_node_color(node_type: str) -> str:
    """Get color for node type."""
    colors = {
        "user": "#3b82f6",
        "preference": "#8b5cf6",
        "website": "#10b981",
        "task": "#f59e0b",
        "memory": "#ec4899",
        "fact": "#6b7280"
    }
    return colors.get(node_type, "#6b7280")


def _get_edge_label(node_type: str) -> str:
    """Get edge label for node type."""
    labels = {
        "preference": "has preference",
        "website": "visits",
        "task": "performed",
        "memory": "remembers",
        "fact": "knows"
    }
    return labels.get(node_type, "related to")
