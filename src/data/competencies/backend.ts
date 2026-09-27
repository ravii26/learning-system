import type { CompetencyMap } from './types';

export const backend: CompetencyMap = {
  key: 'backend',
  title: 'Backend Development',
  aliases: ['backend', 'back-end', 'back end', 'server side', 'node', 'nodejs', 'node.js', 'api development', 'express'],
  description: 'Building secure, reliable server applications and APIs backed by databases.',
  competencies: [
    // Foundations
    { key: 'be-http', title: 'HTTP for backend developers', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware',
      summary: 'Use methods, status codes, headers, cookies and caching correctly.' },
    { key: 'be-runtime', title: 'A server runtime (Node.js)', group: 'Foundations', kind: 'build', importance: 'core', from: 'aware',
      summary: 'Write server code, use the module system and understand the event loop on the server.' },
    { key: 'be-rest', title: 'REST API design', group: 'APIs', kind: 'design', importance: 'core', from: 'use', prerequisites: ['be-http'],
      summary: 'Design resources, validation, pagination, errors and versioning.' },
    { key: 'be-framework', title: 'A web framework (Express or similar)', group: 'APIs', kind: 'build', importance: 'core', from: 'use', prerequisites: ['be-runtime'],
      summary: 'Build routes, middleware and error handling in a framework.' },
    { key: 'be-graphql-rpc', title: 'GraphQL and RPC', group: 'APIs', kind: 'concept', importance: 'optional', from: 'build', prerequisites: ['be-rest'],
      summary: 'Know when GraphQL or gRPC is a better fit than REST.' },

    // Data
    { key: 'be-sql', title: 'SQL databases from code', group: 'Data', kind: 'build', importance: 'core', from: 'use',
      summary: 'Query and migrate a relational database, with an ORM or plain SQL.' },
    { key: 'be-data-modelling', title: 'Data modelling for APIs', group: 'Data', kind: 'design', importance: 'core', from: 'use', prerequisites: ['be-sql'],
      summary: 'Design tables and relations for an application, with indexes where needed.' },
    { key: 'be-caching', title: 'Caching (Redis)', group: 'Data', kind: 'design', importance: 'supporting', from: 'build', prerequisites: ['be-sql'],
      summary: 'Add a cache in front of slow work and keep it correct.' },
    { key: 'be-async-jobs', title: 'Background jobs and queues', group: 'Data', kind: 'design', importance: 'supporting', from: 'build',
      summary: 'Move slow work off the request path with jobs and queues.' },

    // Security
    { key: 'be-auth', title: 'Authentication and authorisation', group: 'Security', kind: 'design', importance: 'core', from: 'use', prerequisites: ['be-http'],
      summary: 'Implement sessions or tokens, password hashing and per-user access checks.' },
    { key: 'be-security', title: 'Common vulnerabilities (OWASP Top 10)', group: 'Security', kind: 'concept', importance: 'core', from: 'build', prerequisites: ['be-auth'],
      summary: 'Prevent injection, XSS, CSRF, SSRF and broken access control.' },

    // Production
    { key: 'be-testing', title: 'Testing backend code', group: 'Production', kind: 'build', importance: 'core', from: 'build', prerequisites: ['be-framework'],
      summary: 'Write unit and integration tests for routes and data access.' },
    { key: 'be-config-deploy', title: 'Configuration and deployment', group: 'Production', kind: 'build', importance: 'core', from: 'build',
      summary: 'Configure through the environment and deploy to a real host (twelve-factor style).' },
    { key: 'be-observability', title: 'Logging, monitoring and errors', group: 'Production', kind: 'concept', importance: 'supporting', from: 'build',
      summary: 'Log usefully, track errors and watch key metrics in production.' },
    { key: 'be-performance', title: 'Performance and scaling basics', group: 'Production', kind: 'concept', importance: 'supporting', from: 'interview', prerequisites: ['be-caching'],
      summary: 'Find bottlenecks and scale a service horizontally.' },
    { key: 'be-project', title: 'Ship a real backend service', group: 'Production', kind: 'build', importance: 'core', from: 'build',
      prerequisites: ['be-rest', 'be-data-modelling', 'be-auth', 'be-config-deploy'],
      summary: 'Build and deploy an API with auth, a database and tests.' },
  ],
};
