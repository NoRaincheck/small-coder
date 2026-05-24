---
name: Dynamic Programming
description: Solve overlapping subproblems by memoizing results — O(n²) or better
priority: 7
tags: ["dynamic programming", "dp", "memoization", "tabulation"]
---

# Dynamic Programming Template

Use when a problem has **overlapping subproblems** and **optimal substructure**.

## Two approaches

### Top-down (memoization)

```typescript
function dp(n: number, memo: Map<number, number>): number {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n)!;
  const result = dp(n - 1, memo) + dp(n - 2, memo);
  memo.set(n, result);
  return result;
}
```

### Bottom-up (tabulation)

```typescript
function dp(n: number): number {
  if (n <= 1) return n;
  const dp = new Array(n + 1).fill(0);
  dp[0] = 0;
  dp[1] = 1;
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}
```

## Recognition patterns

- "Maximum/minimum of something" on arrays, strings, trees
- "Number of ways to do X"
- "Can we achieve target T using subset of items?" (knapsack)
- Edit distance, longest common subsequence, LIS

## Optimization tips

1. Start with recursion → add memo → convert to tabulation
2. Many DP states can be reduced to O(1) space if only the last few values are
   needed
3. Watch for 2D DP (grid problems, string comparison) vs 1D (linear sequences)
