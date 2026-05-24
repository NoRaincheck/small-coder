---
name: Binary Search
description: Efficient search in sorted data — O(log n)
priority: 8
tags: ["binary search", "sorted", "search", "divide and conquer"]
---

# Binary Search Template

Use when the input is **sorted** or has a **monotonic property**.

## Standard template

```typescript
function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1; // not found
}
```

## Key patterns

- **Find first/last occurrence**: adjust bounds to keep searching in one
  direction after a match
- **Search in answer space** (binary search on result): when you need to find
  the minimum value that satisfies a predicate — use `lo = mid + 1` /
  `hi = mid - 1` carefully to avoid infinite loops
- **Edge case**: always handle empty array, single element, and target outside
  range

## Common pitfalls

- Infinite loop: use `(lo + hi) >> 1` or `lo + Math.floor((hi - lo) / 2)` to
  avoid overflow (less relevant in JS but good practice)
- Off-by-one: be consistent with inclusive vs exclusive bounds
