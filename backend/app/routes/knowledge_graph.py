"""
Knowledge Graph API routes for Surf.
Exposes Zep knowledge graph data to the Electron frontend.
Falls back to local SQLite-based fact store when Zep is not configured.
"""

import os
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.local_memory import get_local_graph_data, search_local_facts, get_local_graph_stats
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


def _is_zep_configured() -> bool:
    """Check if Zep Cloud is configured."""
    return bool(settings.zep_api_key)


@router.get("", response_model=GraphData)
async def get_knowledge_graph():
    """
    Retrieve the complete knowledge graph for the current user.
    Always includes local SQLite facts. Merges Zep data when available.
    """
    user_name = settings.zep_user_name or "User"

    # Always get local facts
    local_data = await get_local_graph_data(user_name)
    nodes = [GraphNode(**n) for n in local_data["nodes"]]
    edges = [GraphEdge(**e) for e in local_data["edges"]]

    # Try to merge Zep data if configured
    if _is_zep_configured():
        try:
            memory = get_memory_client()
            
            # Get actual graph nodes from Zep
            zep_nodes = memory.client.graph.node.get_by_user_id(user_id=memory.user_id)
            zep_edges = memory.client.graph.edge.get_by_user_id(user_id=memory.user_id)

            # Add Zep nodes
            if zep_nodes:
                # Deduplicate User node: If Zep has the user, remove the local user node
                # matching the configured user_name to avoid "Two Royces"
                zep_user_found = False
                for zep_node in zep_nodes:
                    label = zep_node.name if hasattr(zep_node, 'name') else str(zep_node)
                    if label == user_name:
                        zep_user_found = True
                        break
                
                if zep_user_found:
                    nodes = [n for n in nodes if n.label != user_name]

                for zep_node in zep_nodes:
                    node_id = f"zep_node_{zep_node.uuid_}" if hasattr(zep_node, 'uuid_') else f"zep_node_{id(zep_node)}"
                    label = zep_node.name if hasattr(zep_node, 'name') else str(zep_node)
                    node_type = _classify_node_type(label, "entity")
                    
                    nodes.append(GraphNode(
                        id=node_id,
                        label=_extract_label(label),
                        type=node_type,
                        size=15,
                        color=_get_node_color(node_type),
                        metadata={
                            "uuid": zep_node.uuid_ if hasattr(zep_node, 'uuid_') else None,
                            "created_at": str(zep_node.created_at) if hasattr(zep_node, 'created_at') else None,
                            "summary": zep_node.summary if hasattr(zep_node, 'summary') else None,
                            "source": "zep",
                        }
                    ))

            # Add Zep edges (facts/relationships)
            if zep_edges:
                edge_offset = len(edges)
                for idx, zep_edge in enumerate(zep_edges):
                    source_id = f"zep_node_{zep_edge.source_node_uuid}" if hasattr(zep_edge, 'source_node_uuid') else "user_1"
                    target_id = f"zep_node_{zep_edge.target_node_uuid}" if hasattr(zep_edge, 'target_node_uuid') else f"zep_edge_{idx}"
                    fact = zep_edge.fact if hasattr(zep_edge, 'fact') else str(zep_edge)
                    
                    edges.append(GraphEdge(
                        id=f"zep_edge_{edge_offset + idx}",
                        source=source_id,
                        target=target_id,
                        label=_extract_label(fact, max_length=30),
                        type="fact"
                    ))
                    
        except Exception as e:
            print(f"[KG] Zep fetch failed, using local only: {e}")

    return GraphData(nodes=nodes, edges=edges)


@router.post("/search", response_model=SearchResult)
async def search_knowledge_graph(search: SearchQuery):
    """
    Search the knowledge graph. Always searches local facts, merges Zep results when available.
    """
    limit = search.limit or 10

    # Always search local facts
    local_results = await search_local_facts(search.query, limit=limit)
    nodes = [GraphNode(**n) for n in local_results]

    # Try Zep search too
    if _is_zep_configured():
        try:
            memory = get_memory_client()
            search_results = memory.client.graph.search(
                user_id=memory.user_id,
                query=search.query,
                limit=limit
            )

            if hasattr(search_results, 'episodes') and search_results.episodes:
                offset = len(nodes)
                for idx, episode in enumerate(search_results.episodes):
                    content = episode.content if hasattr(episode, 'content') else str(episode)
                    episode_type = episode.type if hasattr(episode, 'type') else "fact"
                    node_type = _classify_node_type(content, episode_type)

                    nodes.append(GraphNode(
                        id=f"result_{offset + idx}",
                        label=_extract_label(content),
                        type=node_type,
                        size=15,
                        color=_get_node_color(node_type),
                        metadata={
                            "content": content,
                            "score": episode.score if hasattr(episode, 'score') else None,
                            "episode_type": episode_type,
                            "source": "zep",
                        }
                    ))
        except Exception as e:
            print(f"[KG] Zep search failed, using local only: {e}")

    message = f"Found {len(nodes)} results" if nodes else "No results found"
    return SearchResult(nodes=nodes, message=message)


@router.get("/stats")
async def get_graph_stats():
    """Get statistics about the knowledge graph. Always includes local facts count."""
    local_stats = await get_local_graph_stats()
    local_stats["user_id"] = settings.zep_user_id

    if _is_zep_configured():
        try:
            memory = get_memory_client()
            search_results = memory.client.graph.search(
                user_id=memory.user_id,
                query="*",
                limit=50
            )
            zep_facts = len(search_results.episodes) if hasattr(search_results, 'episodes') else 0
            local_stats["total_facts"] = local_stats.get("total_facts", 0) + zep_facts
        except Exception as e:
            print(f"[KG] Zep stats failed: {e}")

    return local_stats


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
