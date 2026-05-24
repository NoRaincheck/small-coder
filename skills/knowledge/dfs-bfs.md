---
name: DFS & BFS
description: Graph/tree traversal — DFS for recursion/backtracking, BFS for shortest path
priority: 7
tags: ["dfs", "bfs", "graph", "tree", "traversal"]
---

# DFS & BFS Templates

## DFS (depth-first search) — recursive

```typescript
function dfs(node: TreeNode | null): void {
  if (!node) return;
  // process node
  dfs(node.left);
  dfs(node.right);
}
```

## DFS with backtracking

```typescript
function backtrack(path: number[], used: boolean[]): void {
  if (path.length === n) /* record result */ return;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    path.push(i);
    used[i] = true;
    backtrack(path, used);
    path.pop();
    used[i] = false; // undo
  }
}
```

## BFS — level order / shortest path

```typescript
function bfs(start: number): number {
  const queue: [number, number][] = [[start, 0]]; // [node, distance]
  const visited = new Set<number>([start]);
  while (queue.length > 0) {
    const [node, dist] = queue.shift()!;
    if (node === target) return dist;
    for (const neighbor of getNeighbors(node)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return -1; // unreachable
}
```

## When to use which?

- **DFS**: recursion, backtracking, exploring all possibilities, topological
  sort
- **BFS**: shortest path in unweighted graph, level-order processing, finding
  nearest solution
