const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with sample learning cards...');

  // Clean existing data
  await prisma.activityLog.deleteMany({});
  await prisma.topic.deleteMany({});
  await prisma.reviewLog.deleteMany({});

  // Seed sample topics
  const topics = [
    {
      title: 'System Design & Distributed Architectures',
      area: 'Tech',
      why: 'To design production-grade distributed backend systems and prepare for senior engineering interviews.',
      depthTarget: 'Deep',
      status: 'active',
      progressPct: 45,
      currentStage: 'Core Knowledge',
      nextAction: 'Study CAP theorem trade-offs through 3 real distributed-system examples.',
      proofOfLearning: 'Build and document a fully functioning sharded database simulator and write a blog post analyzing it.',
      notes: 'Focus on horizontal scaling, message queues (RabbitMQ/Kafka), and SQL vs NoSQL trade-offs.',
      resources: [
        { title: 'Designing Data-Intensive Applications', type: 'BOOK', url: 'https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/', purpose: 'Understand fundamental theory of storage, processing, and replication.', status: 'IN_PROGRESS', notes: 'Currently on Chapter 5: Replication.' },
        { title: 'System Design Primer', type: 'WEBSITE', url: 'https://github.com/donnemartin/system-design-primer', purpose: 'Quick reference check and mock diagrams.', status: 'NOT_STARTED', notes: 'Use for interview prep later.' }
      ]
    },
    {
      title: 'Business Valuation & Financial Statement Analysis',
      area: 'Finance',
      why: 'To evaluate public companies for personal investing and understand business mechanics.',
      depthTarget: 'Proficiency',
      status: 'active',
      progressPct: 20,
      currentStage: 'Fundamentals',
      nextAction: 'Complete three practical DCF valuation models of mature companies.',
      proofOfLearning: 'Perform a comprehensive valuation analysis report on Apple Inc. and post the PDF.',
      notes: 'Key concepts to master: Free Cash Flow to Firm (FCFF), WACC, Terminal Value, and Balance Sheet analysis.',
      resources: [
        { title: 'Damodaran on Valuation', type: 'BOOK', url: '', purpose: 'Learn cash flow discounting models.', status: 'IN_PROGRESS', notes: 'Read Chapters 1-4 on basics of risk and return.' }
      ]
    },
    {
      title: 'Negotiation & Influence Strategy',
      area: 'Personal',
      why: 'Improve communications for workplace proposals and vendor negotiations.',
      depthTarget: 'Working Knowledge',
      status: 'paused',
      progressPct: 60,
      currentStage: 'Application',
      nextAction: 'Roleplay next salary negotiation using the "Never Split the Difference" checklist.',
      proofOfLearning: 'Successfully negotiate a 10% discount on a personal software SaaS subscription or service.',
      notes: 'Focus on tactical empathy, calibrated questions, and mirroring.',
      resources: [
        { title: 'Never Split the Difference', type: 'BOOK', url: 'https://www.harpercollins.com/products/never-split-the-difference-chris-voss', purpose: 'Learn tactical negotiation techniques.', status: 'COMPLETED', notes: 'Took extensive notes on calibrated questions.' }
      ]
    },
    {
      title: 'Kubernetes & Container Orchestration',
      area: 'Tech',
      why: 'Deploy backend microservices reliably.',
      depthTarget: 'Working Knowledge',
      status: 'queued',
      progressPct: 0,
      currentStage: 'Define',
      nextAction: 'Set up a local Minikube cluster and deploy a simple 3-tier node app.',
      proofOfLearning: 'Deploy a multi-service containerized application with auto-scaling and ingress on local minikube.',
      notes: 'Need to learn Pods, Services, Deployments, ConfigMaps, and Secrets.',
      resources: []
    },
    {
      title: 'Product Management Fundamentals',
      area: 'Business',
      why: 'Understand PM workflows to align engineering goals.',
      depthTarget: 'Awareness',
      status: 'queued',
      progressPct: 0,
      currentStage: 'Define',
      nextAction: 'Read PM basics on Product School handbook.',
      proofOfLearning: 'Write a basic PRD (Product Requirement Document) for a new learning feature.',
      notes: 'General overview of product lifecycle and user stories.',
      resources: []
    },
    {
      title: 'Learn Negotiation',
      area: 'Other',
      status: 'inbox',
      progressPct: 0,
      currentStage: 'Define',
      resources: []
    },
    {
      title: 'Cinematography & Lighting Basics',
      area: 'Creative',
      why: 'Shoot better personal videos.',
      depthTarget: 'Working Knowledge',
      status: 'maintenance',
      progressPct: 100,
      currentStage: 'Proof',
      nextAction: 'Check latest developments in budget camera lighting.',
      proofOfLearning: 'Create a short 30-second video featuring 3-point lighting setup.',
      notes: 'Completed in March. Maintenance review quarterly.',
      resources: [
        { title: 'Lighting 101 Course', type: 'COURSE', url: 'https://www.youtube.com', purpose: 'Learn key lighting angles.', status: 'COMPLETED', notes: 'Mastered key, fill, and back light setups.' }
      ]
    }
  ];

  for (const t of topics) {
    const created = await prisma.topic.create({
      data: {
        ...t,
        startedDate: t.status === 'active' ? new Date() : null,
      }
    });

    // Seed initial activity logs
    await prisma.activityLog.create({
      data: {
        topicId: created.id,
        fieldChanged: 'status',
        oldValue: null,
        newValue: created.status
      }
    });

    if (created.nextAction) {
      await prisma.activityLog.create({
        data: {
          topicId: created.id,
          fieldChanged: 'nextAction',
          oldValue: null,
          newValue: created.nextAction
        }
      });
    }
  }

  // Create a sample weekly review log from 5 days ago
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  
  await prisma.reviewLog.create({
    data: {
      reviewedAt: fiveDaysAgo,
      topicsReviewed: [
        { topicId: 'dummy-id-1', title: 'System Design & Distributed Architectures', decision: 'continue' },
        { topicId: 'dummy-id-2', title: 'Negotiation & Influence Strategy', decision: 'pause' }
      ]
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
