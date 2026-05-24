---
name: Two Pointers & Sliding Window
description: Process arrays in O(n) with two moving indices or a variable-sized window
priority: 6
tags: ["two pointers", "sliding window", "array", "sorted"]
---

# Two Pointers & Sliding Window Templates

## Two pointers (converging) — sorted array problems

```typescript
function twoSumSorted(nums: number[], target: number): [number, number] {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const sum = nums[lo] + nums[hi];
    if (sum === target) return [lo, hi];
    if (sum < target) lo++;
    else hi--;
  }
  return [-1, -1];
}
```

## Two pointers (same direction) — fast/slow pattern

```typescript
function removeDuplicates(nums: number[]): number {
  let write = 1;
  for (let read = 1; read < nums.length; read++) {
    if (nums[read] !== nums[write - 1]) {
      nums[write++] = nums[read];
    }
  }
  return write;
}
```

## Sliding window (variable size)

```typescript
function longestSubstringWithK(s: string, k: number): number {
  let maxLen = 0, left = 0, charCount: Map<string, number> = new Map();
  for (let right = 0; right < s.length; right++) {
    charCount.set(s[right], (charCount.get(s[right]) || 0) + 1);
    while (charCount.size > k) {
      const leftChar = s[left];
      if ((charCount.get(leftChar)! - 1) === 0) charCount.delete(leftChar);
      else charCount.set(leftChar, charCount.get(leftChar)! - 1);
      left++;
    }
    maxLen = Math.max(maxLen, right - left + 1);
  }
  return maxLen;
}
```

## Recognition patterns

- **"Two pointers"**: sorted array, find pairs/triplets, remove duplicates,
  merge intervals
- **"Sliding window"**: longest/shortest substring with condition, subarray sum
  ≥ k
