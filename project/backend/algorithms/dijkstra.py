"""
Manual implementation of Dijkstra's shortest-path algorithm for SafeRoute.

Why a graph?
  A route returned by OSRM is a sequence of coordinates. To choose a "safer"
  route we treat consecutive coordinates as nodes in a graph and the stretch
  between them as an edge. Each edge carries:
    - distance (meters)
    - safety_score (0..100, higher = safer)
    - risk (0..100, derived: 100 - safety_score)

Edge cost (what Dijkstra minimizes):
  edge_cost = distance_weight * normalized_distance
            + safety_weight * normalized_risk

  normalized_distance = distance / max_segment_distance  (0..1)
  normalized_risk     = (100 - safety_score) / 100        (0..1)

  By increasing safety_weight we tell Dijkstra to prefer safer edges even if
  that makes the total path slightly longer. The weights are configurable.

We implement Dijkstra with a binary heap (heapq) for efficiency. We do NOT
call any library "dijkstra" function; the core relaxation loop is written by
hand.
"""

from __future__ import annotations

import heapq
import math
from typing import Dict, List, Tuple

# Default trade-off between distance and safety. Increase SAFETY_WEIGHT to
# prefer safer paths over shorter ones.
DISTANCE_WEIGHT = 0.4
SAFETY_WEIGHT = 0.6


def build_graph(segments: list[dict]) -> dict:
    """Build an adjacency-list graph from route segments.

    Each segment has: from_node (int), to_node (int), distance (m),
    safety_score (0..100). We normalize and compute edge_cost here so the
    Dijkstra routine stays generic.
    """
    max_distance = max((s["distance"] for s in segments), default=1.0) or 1.0

    graph: Dict[int, List[Tuple[int, float, dict]]] = {}
    for seg in segments:
        u = seg["from_node"]
        v = seg["to_node"]
        norm_dist = seg["distance"] / max_distance
        norm_risk = (100.0 - seg["safety_score"]) / 100.0
        cost = DISTANCE_WEIGHT * norm_dist + SAFETY_WEIGHT * norm_risk
        edge_info = {
            "distance": seg["distance"],
            "safety_score": seg["safety_score"],
            "cost": cost,
        }
        graph.setdefault(u, []).append((v, cost, edge_info))
        # Make the graph undirected so Dijkstra can traverse either way.
        graph.setdefault(v, []).append((u, cost, edge_info))
    return graph


def dijkstra(graph: dict, source: int, target: int) -> Tuple[List[int], float, List[dict]]:
    """Run Dijkstra's algorithm from source to target.

    Returns:
      (path_nodes, total_cost, edges_along_path)
    """
    # dist[node] = shortest known combined cost from source to node
    dist: Dict[int, float] = {source: 0.0}
    prev: Dict[int, int] = {}
    prev_edge: Dict[int, dict] = {}
    visited: set = set()
    # Priority queue entries: (cost, node)
    pq: List[Tuple[float, int]] = [(0.0, source)]

    while pq:
        current_cost, u = heapq.heappop(pq)
        if u in visited:
            continue
        visited.add(u)
        if u == target:
            break
        for v, weight, edge_info in graph.get(u, []):
            if v in visited:
                continue
            new_cost = current_cost + weight
            if v not in dist or new_cost < dist[v]:
                dist[v] = new_cost
                prev[v] = u
                prev_edge[v] = edge_info
                heapq.heappush(pq, (new_cost, v))

    if target not in dist:
        return [], math.inf, []

    # Reconstruct the path backwards from target to source.
    path: List[int] = [target]
    edges: List[dict] = []
    node = target
    while node != source:
        node = prev[node]
        path.append(node)
    path.reverse()

    # Collect edges along the reconstructed path.
    for i in range(1, len(path)):
        edges.append(prev_edge[path[i]])
    return path, dist[target], edges


def optimize_route(segments: list[dict]) -> dict:
    """Build a graph from segments and run Dijkstra end-to-end.

    Each segment is expected to have from_node, to_node, distance, safety_score.
    Returns the optimized path info: node ids, total distance, avg safety,
    and the edges chosen.
    """
    if not segments:
        return {"path": [], "total_distance": 0, "avg_safety": 0, "edges": []}

    # Nodes are 0..N based on segment ordering.
    source = segments[0]["from_node"]
    target = segments[-1]["to_node"]

    graph = build_graph(segments)
    path, cost, edges = dijkstra(graph, source, target)

    total_distance = sum(e["distance"] for e in edges)
    avg_safety = (sum(e["safety_score"] for e in edges) / len(edges)) if edges else 0.0
    return {
        "path": path,
        "total_cost": round(cost, 4),
        "total_distance": round(total_distance, 2),
        "avg_safety": round(avg_safety, 2),
        "edges": edges,
    }
