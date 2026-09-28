import type { CompetencyMap } from './types';

export const dsa: CompetencyMap = {
  key: 'dsa',
  title: 'Data Structures and Algorithms',
  aliases: ['dsa', 'data structures', 'algorithms', 'data structures and algorithms', 'leetcode', 'competitive programming', 'coding interview'],
  description: 'Choosing the right data structure and algorithm, and solving unfamiliar problems cold.',
  competencies: [
    // Foundations
    { key: 'dsa-complexity', title: 'Time and space complexity', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware',
      summary: 'Analyse Big-O of code and compare approaches before writing them.' },
    { key: 'dsa-arrays-strings', title: 'Arrays and strings', group: 'Foundations', kind: 'algorithm', importance: 'core', from: 'aware',
      summary: 'Manipulate arrays and strings in place, with prefix sums and frequency counts.' },
    { key: 'dsa-hashing', title: 'Hash maps and sets', group: 'Foundations', kind: 'algorithm', importance: 'core', from: 'aware',
      summary: 'Use hashing to trade memory for O(1) lookups; spot when a problem wants it.' },
    { key: 'dsa-recursion', title: 'Recursion', group: 'Foundations', kind: 'algorithm', importance: 'core', from: 'use',
      summary: 'Write correct recursive solutions with clear base cases, and trace the call stack.' },

    // Core patterns
    { key: 'dsa-two-pointers', title: 'Two pointers', group: 'Core patterns', kind: 'algorithm', importance: 'core', from: 'use', prerequisites: ['dsa-arrays-strings'],
      summary: 'Solve pair, partition and in-place problems with two moving indices.' },
    { key: 'dsa-sliding-window', title: 'Sliding window', group: 'Core patterns', kind: 'algorithm', importance: 'core', from: 'use', prerequisites: ['dsa-two-pointers', 'dsa-hashing'],
      summary: 'Handle fixed and variable windows over sequences.' },
    { key: 'dsa-stack-queue', title: 'Stacks, queues and monotonic stacks', group: 'Core patterns', kind: 'algorithm', importance: 'core', from: 'use',
      summary: 'Use stacks and queues, including monotonic stacks for next-greater problems.' },
    { key: 'dsa-binary-search', title: 'Binary search', group: 'Core patterns', kind: 'algorithm', importance: 'core', from: 'use', prerequisites: ['dsa-arrays-strings'],
      summary: 'Binary search on sorted data and on the answer, with correct boundaries.' },
    { key: 'dsa-linked-lists', title: 'Linked lists', group: 'Core patterns', kind: 'algorithm', importance: 'core', from: 'use',
      summary: 'Reverse, merge and detect cycles with pointer manipulation.' },
    { key: 'dsa-sorting', title: 'Sorting and its uses', group: 'Core patterns', kind: 'algorithm', importance: 'supporting', from: 'use',
      summary: 'Know merge/quick/counting sort and use sorting to simplify problems.' },

    // Trees and graphs
    { key: 'dsa-trees', title: 'Binary trees and BSTs', group: 'Trees and graphs', kind: 'algorithm', importance: 'core', from: 'use', prerequisites: ['dsa-recursion'],
      summary: 'Traverse trees (DFS/BFS) and use BST properties.' },
    { key: 'dsa-heaps', title: 'Heaps and priority queues', group: 'Trees and graphs', kind: 'algorithm', importance: 'core', from: 'use',
      summary: 'Solve top-k, merge-k and scheduling problems with heaps.' },
    { key: 'dsa-tries', title: 'Tries', group: 'Trees and graphs', kind: 'algorithm', importance: 'supporting', from: 'build', prerequisites: ['dsa-trees'],
      summary: 'Build and query prefix trees for word problems.' },
    { key: 'dsa-graphs', title: 'Graph traversal (BFS/DFS)', group: 'Trees and graphs', kind: 'algorithm', importance: 'core', from: 'use', prerequisites: ['dsa-recursion', 'dsa-stack-queue'],
      summary: 'Model problems as graphs and traverse grids and adjacency lists.' },
    { key: 'dsa-advanced-graphs', title: 'Topological sort, shortest paths, union-find', group: 'Trees and graphs', kind: 'algorithm', importance: 'supporting', from: 'build', prerequisites: ['dsa-graphs'],
      summary: 'Apply topological sort, Dijkstra and union-find where they fit.' },

    // Advanced techniques
    { key: 'dsa-backtracking', title: 'Backtracking', group: 'Advanced techniques', kind: 'algorithm', importance: 'core', from: 'build', prerequisites: ['dsa-recursion'],
      summary: 'Generate subsets, permutations and constrained searches with pruning.' },
    { key: 'dsa-dp', title: 'Dynamic programming', group: 'Advanced techniques', kind: 'algorithm', importance: 'core', from: 'build', prerequisites: ['dsa-recursion'],
      summary: 'Find the state and transition, from memoised recursion to tabulation.' },
    { key: 'dsa-greedy', title: 'Greedy algorithms and intervals', group: 'Advanced techniques', kind: 'algorithm', importance: 'supporting', from: 'build', prerequisites: ['dsa-sorting'],
      summary: 'Recognise when a greedy choice is safe; handle interval problems.' },
    { key: 'dsa-bit-manipulation', title: 'Bit manipulation', group: 'Advanced techniques', kind: 'algorithm', importance: 'optional', from: 'interview',
      summary: 'Use bitwise tricks for sets and parity problems.' },

    // Interview application
    { key: 'dsa-problem-solving', title: 'Solving unseen problems under time', group: 'Interview application', kind: 'skill', importance: 'core', from: 'interview',
      prerequisites: ['dsa-sliding-window', 'dsa-binary-search', 'dsa-trees', 'dsa-graphs', 'dsa-dp'],
      summary: 'Pick a pattern for an unfamiliar problem, talk through it and code it within 30–45 minutes.' },
  ],
};
