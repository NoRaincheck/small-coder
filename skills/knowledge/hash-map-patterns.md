---
name: Hash Map Patterns
description: Use maps/sets for O(1) lookups — the go-to pattern when you need fast membership or frequency counting
priority: 6
tags: ["hash map", "set", "frequency", "lookup", "dictionary"]
---

# Hash Map & Set Patterns

## Frequency counting

```typescript
function characterFrequency(s: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const ch of s) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  return freq;
}

// Common pattern: find duplicates in O(n) time, O(1) extra space if bounded alphabet
function hasDuplicate(nums: number[]): boolean {
  const seen = new Set<number>();
  for (const n of nums) {
    if (seen.has(n)) return true;
    seen.add(n);
  }
  return false;
}
```

## Two-sum / complement pattern

```typescript
function twoSum(nums: number[], target: number): [number, number] {
  const map = new Map<number, number>(); // value → index
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement)!, i];
    map.set(nums[i], i);
  }
  return [-1, -1];
}
```

## Grouping / categorizing

```typescript
function groupAnagrams(words: string[]): string[][] {
  const groups = new Map<string, string[]>(); // sorted key → words
  for (const word of words) {
    const key = word.split("").sort().join("");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(word);
  }
  return Array.from(groups.values());
}
```

## Recognition patterns

- **"Contains duplicate"**, **"Two sum"**, **"Valid anagram"** → hash set/map
- **Need O(1) lookup** → avoid nested loops, use a map instead
- **Frequency/counting problems** → hash map with counts
