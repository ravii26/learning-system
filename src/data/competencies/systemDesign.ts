import type { CompetencyMap } from './types';

export const systemDesign: CompetencyMap = {
  key: 'system-design',
  title: 'System Design',
  aliases: ['system design', 'systems design', 'hld', 'high level design', 'high-level design', 'distributed systems design', 'software architecture'],
  description: 'Designing systems that scale, stay available and make sensible trade-offs, and explaining those choices.',
  competencies: [
    // Fundamentals
    { key: 'sd-requirements', title: 'Requirements and estimation', group: 'Fundamentals', kind: 'design', importance: 'core', from: 'use',
      summary: 'Turn a vague prompt into functional and non-functional requirements, and estimate traffic, storage and bandwidth.' },
    { key: 'sd-latency-throughput', title: 'Latency, throughput and performance numbers', group: 'Fundamentals', kind: 'concept', importance: 'core', from: 'aware',
      summary: 'Know the latency of memory, disk, network and datacenter hops, and reason about throughput limits.' },
    { key: 'sd-scalability', title: 'Vertical and horizontal scaling', group: 'Fundamentals', kind: 'concept', importance: 'core', from: 'aware',
      summary: 'Explain when to scale up versus out, and why stateless services scale out easily.' },
    { key: 'sd-availability', title: 'Availability and reliability', group: 'Fundamentals', kind: 'concept', importance: 'core', from: 'aware',
      summary: 'Reason about uptime, redundancy, failover and single points of failure.' },
    { key: 'sd-cap-consistency', title: 'CAP, consistency models and trade-offs', group: 'Fundamentals', kind: 'concept', importance: 'core', from: 'use', prerequisites: ['sd-availability'],
      summary: 'Explain strong versus eventual consistency and what CAP/PACELC mean for a real design.' },
    { key: 'sd-networking-basics', title: 'Networking for system design (DNS, HTTP, TCP, CDN)', group: 'Fundamentals', kind: 'concept', importance: 'supporting', from: 'aware',
      summary: 'Follow a request from DNS lookup through load balancer to server, and know where a CDN helps.' },

    // Building blocks
    { key: 'sd-load-balancing', title: 'Load balancing', group: 'Building blocks', kind: 'concept', importance: 'core', from: 'aware', prerequisites: ['sd-scalability'],
      summary: 'Choose L4 versus L7 balancing and balancing algorithms; handle health checks and sticky sessions.' },
    { key: 'sd-caching', title: 'Caching', group: 'Building blocks', kind: 'design', importance: 'core', from: 'aware', prerequisites: ['sd-latency-throughput'],
      summary: 'Pick cache placement and strategy (cache-aside, write-through, write-back), eviction, TTLs and invalidation.' },
    { key: 'sd-databases', title: 'SQL versus NoSQL and data modelling', group: 'Building blocks', kind: 'design', importance: 'core', from: 'use',
      summary: 'Choose a database for an access pattern and model the data for it.' },
    { key: 'sd-replication', title: 'Replication', group: 'Building blocks', kind: 'concept', importance: 'core', from: 'use', prerequisites: ['sd-databases'],
      summary: 'Explain leader-follower, multi-leader and leaderless replication and their lag and failover behaviour.' },
    { key: 'sd-partitioning', title: 'Sharding and partitioning', group: 'Building blocks', kind: 'design', importance: 'core', from: 'use', prerequisites: ['sd-databases'],
      summary: 'Choose a partition key, handle hot spots and rebalancing; know consistent hashing.' },
    { key: 'sd-queues', title: 'Message queues and async processing', group: 'Building blocks', kind: 'design', importance: 'core', from: 'use',
      summary: 'Decouple work with queues and streams; reason about delivery guarantees, ordering and back-pressure.' },
    { key: 'sd-storage', title: 'Blob and file storage', group: 'Building blocks', kind: 'concept', importance: 'supporting', from: 'use',
      summary: 'Store large objects in object storage and serve them via a CDN.' },
    { key: 'sd-search', title: 'Search and indexing', group: 'Building blocks', kind: 'concept', importance: 'optional', from: 'build',
      summary: 'Know when to add a search index (inverted index) and how it stays in sync.' },

    // Architecture
    { key: 'sd-api-design', title: 'API design', group: 'Architecture', kind: 'design', importance: 'core', from: 'use',
      summary: 'Design REST or RPC APIs with sensible resources, pagination, idempotency and versioning.' },
    { key: 'sd-microservices', title: 'Monolith versus microservices', group: 'Architecture', kind: 'concept', importance: 'supporting', from: 'use',
      summary: 'Explain the costs and benefits of splitting services, and service-to-service communication.' },
    { key: 'sd-rate-limiting', title: 'Rate limiting', group: 'Architecture', kind: 'design', importance: 'supporting', from: 'build',
      summary: 'Design token-bucket or sliding-window limiting, and where it runs.' },
    { key: 'sd-security', title: 'Authentication and security basics', group: 'Architecture', kind: 'concept', importance: 'supporting', from: 'build',
      summary: 'Place authentication, authorisation, TLS and secrets correctly in an architecture.' },
    { key: 'sd-observability', title: 'Monitoring and observability', group: 'Architecture', kind: 'concept', importance: 'supporting', from: 'build',
      summary: 'Decide what to measure (metrics, logs, traces) and what to alert on.' },

    // Distributed systems
    { key: 'sd-consensus', title: 'Consensus and coordination', group: 'Distributed systems', kind: 'concept', importance: 'optional', from: 'interview', prerequisites: ['sd-replication'],
      summary: 'Explain leader election and why Raft/Paxos and coordination services exist.' },
    { key: 'sd-distributed-transactions', title: 'Distributed transactions and sagas', group: 'Distributed systems', kind: 'concept', importance: 'supporting', from: 'interview', prerequisites: ['sd-queues'],
      summary: 'Keep data consistent across services with two-phase commit or sagas, and know the trade-offs.' },
    { key: 'sd-failure-handling', title: 'Failure handling: retries, timeouts, idempotency', group: 'Distributed systems', kind: 'design', importance: 'core', from: 'build',
      summary: 'Design for partial failure with timeouts, retries with backoff, circuit breakers and idempotent operations.' },

    // Interview application
    { key: 'sd-case-studies', title: 'Classic designs (URL shortener, feed, chat, etc.)', group: 'Interview application', kind: 'design', importance: 'core', from: 'build',
      prerequisites: ['sd-caching', 'sd-databases', 'sd-partitioning', 'sd-queues', 'sd-api-design'],
      summary: 'Design well-known systems end to end, using the building blocks.' },
    { key: 'sd-tradeoff-communication', title: 'Explaining trade-offs under time', group: 'Interview application', kind: 'skill', importance: 'core', from: 'interview',
      prerequisites: ['sd-case-studies'],
      summary: 'Drive a 45-minute design discussion: clarify, sketch, deep-dive and justify choices out loud.' },
  ],
};
