import React, { useState, useEffect } from 'react';

interface Concept {
  id: string;
  title: string;
  status: string;
  parentId: string | null;
  difficulty: 'Low' | 'Medium' | 'High';
  importance: 'Low' | 'Medium' | 'High';
}

interface SocraticCoachProps {
  concept: Concept;
  topicId: string;
  onSaveProgress: (conceptId: string, success: boolean, mistakeText?: string, whyMade?: string, howToAvoid?: string) => Promise<void>;
  explanationsRead: number;
  onIncrementExplanationsRead: () => void;
  onResetExplanationsRead: () => void;
}

// Predefined database of high-fidelity tutoring content for common topics
const SOCRATIC_LIBRARY: Record<string, {
  explain: string;
  demonstrate: string;
  connect: string;
  question: string;
  apply: string;
  idealAnswer: string;
}> = {
  'distributed fundamentals (cap theorem)': {
    explain: 'The CAP Theorem states that in any distributed data store, you can only guarantee two out of three characteristics at the same time: Consistency (every read gets the latest write), Availability (every non-failing node returns a response), and Partition Tolerance (the system operates despite network failures). In practice, since network partitions (P) are inevitable, you must choose between Consistency (C) or Availability (A).',
    demonstrate: 'Imagine Node A and Node B. A partition occurs, cutting the link between them. A client writes "X=5" to Node A. Node A cannot sync this to B. If another client reads from Node B, B must either: (1) Fail the read to maintain Consistency (CP choice), or (2) Return the old value "X=null" to maintain Availability (AP choice).',
    connect: 'This connects directly to database replicas. If you run a globally sharded database, you must accept eventual consistency (AP) for non-critical assets (like social media likes) but enforce strong consistency (CP) for account balances or checkout transactions.',
    question: 'In your own words, explain why a distributed system cannot guarantee both Consistency and Availability during a network partition.',
    apply: 'You are designing the cart system for an online retailer. During a major sales event, a network split occurs between the European and US datacenters. Should you configure the cart database as AP (let customers add items but risk stock-level drift) or CP (block additions to guarantee accurate inventory)? Justify your decision.',
    idealAnswer: 'In an e-commerce checkout, availability is revenue. Most retailers choose AP (Availability) for the shopping cart, allowing users to add items. If inventory oversells due to eventual consistency, they resolve it after the fact (e.g., emailing the customer, shipping late). Blocking the user from adding items (CP) destroys sales conversion. However, for the final payment transaction, CP must be enforced to avoid double-charging.',
  },
  'database replication & consistency': {
    explain: 'Replication is copying data across multiple nodes to ensure high availability and durability. The consistency model defines when and how all replicas see the latest updates. High-fidelity models range from Single-Leader (where writes go to one node and stream to replicas asynchronously or synchronously) to Multi-Leader and Leaderless replication (where writes require a quorum of nodes to agree).',
    demonstrate: 'In synchronous replication, Leader blocks the write until all Follower replicas acknowledge. In asynchronous replication, Leader writes locally and responds to the client immediately, streaming logs to Followers in the background. Asynchronous replication is fast but risks data loss if the Leader crashes before replicas catch up.',
    connect: 'Connect this to database latency. If you need sub-millisecond writes, you must use asynchronous replication, which introduces "read-after-write" consistency issues (users update a profile, refresh, and see their old profile because the read hit a lagging replica).',
    question: 'What is the "replication lag" problem, and how does it manifest to an end-user in an asynchronous single-leader setup?',
    apply: 'Design a replication system for a banking system ledger where transactions must never be lost, and a read must always reflect the absolute current balance. Which replication mode and consistency configurations will you select?',
    idealAnswer: 'You must use synchronous replication on at least one backup replica (semi-synchronous setup) or use a leaderless quorum write (W + R > N, e.g., writing to 2 out of 3 nodes and reading from 2 out of 3). This guarantees that at least one node in the read quorum has the latest transaction update, ensuring strong read-after-write consistency.',
  },
};

export default function SocraticCoach({
  concept,
  topicId,
  onSaveProgress,
  explanationsRead,
  onIncrementExplanationsRead,
  onResetExplanationsRead,
}: SocraticCoachProps) {
  // Tutor Stages: 'explain' | 'demonstrate' | 'connect' | 'question' | 'retrieve' | 'apply' | 'correct'
  const [stage, setStage] = useState<'explain' | 'demonstrate' | 'connect' | 'question' | 'retrieve' | 'apply' | 'correct'>('explain');
  
  // Student inputs
  const [retrievalInput, setRetrievalInput] = useState('');
  const [applyInput, setApplyInput] = useState('');
  
  // Self assessment & Mistake Logger
  const [selfAssessment, setSelfAssessment] = useState<'correct' | 'partial' | 'wrong'>('correct');
  const [mistakeText, setMistakeText] = useState('');
  const [whyMade, setWhyMade] = useState('');
  const [howToAvoid, setHowToAvoid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Retrieve templates
  const titleKey = concept.title.toLowerCase();
  const template = SOCRATIC_LIBRARY[titleKey] || {
    explain: `Let's break down "${concept.title}". This represents a core capability in your study curriculum. Understanding this involves mastering the fundamental rules, structures, and execution steps.`,
    demonstrate: `Consider a real-world scenario of "${concept.title}". By observing how the components interact under stress, we can see the exact mechanics in action.`,
    connect: `Connect this concept to your existing foundational prerequisites. Mastering "${concept.title}" allows you to scale up to advanced problem-solving in this area.`,
    question: `Explain the core mechanism of "${concept.title}" and identify its two main constraints.`,
    apply: `Imagine you are working in a production environment and you encounter a critical failure related to "${concept.title}". Write a proposal detailing how you would diagnose and resolve it.`,
    idealAnswer: `The ideal resolution involves: (1) Isolating the failure boundary, (2) Analyzing system invariants, and (3) Adapting thresholds to ensure high resilience and correctness under load.`,
  };

  // Reset stage when concept changes
  useEffect(() => {
    setStage('explain');
    setRetrievalInput('');
    setApplyInput('');
    setMistakeText('');
    setWhyMade('');
    setHowToAvoid('');
    onIncrementExplanationsRead(); // Track content consumption
  }, [concept.id]);

  const handleNextStage = () => {
    if (stage === 'explain') setStage('demonstrate');
    else if (stage === 'demonstrate') setStage('connect');
    else if (stage === 'connect') setStage('question');
    else if (stage === 'question') setStage('retrieve');
  };

  const submitRetrieval = () => {
    if (retrievalInput.trim().length < 15) {
      alert('Retrieval requires effort! Please write a more detailed explanation from memory.');
      return;
    }
    // Reset retrieval guard upon active recall check
    onResetExplanationsRead();
    setStage('apply');
  };

  const submitApply = () => {
    if (applyInput.trim().length < 15) {
      alert('Please write out your solution proposal before viewing the evaluation.');
      return;
    }
    setStage('correct');
  };

  const handleSaveAssessment = async () => {
    setSubmitting(true);
    try {
      const isSuccess = selfAssessment === 'correct' || selfAssessment === 'partial';
      await onSaveProgress(
        concept.id,
        isSuccess,
        selfAssessment === 'wrong' || mistakeText ? mistakeText || `Incorrect understanding of ${concept.title}` : undefined,
        whyMade,
        howToAvoid
      );
      
      alert('Socratic learning session logged! Your mastery level has been updated.');
      setStage('explain');
      setRetrievalInput('');
      setApplyInput('');
      setMistakeText('');
      setWhyMade('');
      setHowToAvoid('');
    } catch (e) {
      console.error(e);
      alert('Connection error logging assessment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Retrieval Guard overlay block
  if (explanationsRead >= 3) {
    return (
      <div className="glass-panel" style={{ padding: '32px', borderLeft: '4px solid var(--color-danger)', background: 'rgba(239, 68, 68, 0.03)' }}>
        <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: '16px' }}>🚨</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-danger)', textAlign: 'center', marginBottom: '8px' }}>
          Fake Progress Warning (Retrieval Guard)
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
          You have read explanations for <strong>{explanationsRead}</strong> concepts in a row without testing your memory. Learning science shows that consumption without retrieval leads to immediate forgetting.
        </p>

        <div className="form-group">
          <label className="form-label" style={{ color: 'var(--color-danger)' }}>
            FREE RECALL CHALLENGE: Summarize "{concept.title}" from memory now to unlock the workspace.
          </label>
          <textarea
            className="form-input"
            style={{ width: '100%', height: '120px', resize: 'none', background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace' }}
            placeholder="Type what you remember about this concept from memory. No looking back!"
            value={retrievalInput}
            onChange={(e) => setRetrievalInput(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (retrievalInput.trim().length < 20) {
              alert('Please write a genuine recall summary (at least 20 characters) to unlock.');
              return;
            }
            onResetExplanationsRead();
            setStage('explain');
            setRetrievalInput('');
          }}
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '12px' }}
        >
          🔑 Submit Active Recall & Unlock Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Concept Header */}
      <div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Socratic Coach ➔ Study Concept:
        </span>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>{concept.title}</h3>
      </div>

      {/* Socratic Flow Navigation Steps */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', gap: '8px', overflowX: 'auto' }}>
        {[
          { key: 'explain', label: '1. Explain' },
          { key: 'demonstrate', label: '2. Demo' },
          { key: 'connect', label: '3. Connect' },
          { key: 'question', label: '4. Question' },
          { key: 'retrieve', label: '5. Recall' },
          { key: 'apply', label: '6. Apply' },
          { key: 'correct', label: '7. Evaluate' },
        ].map((s) => {
          const isActive = stage === s.key;
          return (
            <span
              key={s.key}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: isActive ? 'var(--color-primary-light)' : 'var(--color-text-muted)',
                padding: '4px 8px',
                borderRadius: '4px',
                background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent',
              }}
            >
              {s.label}
            </span>
          );
        })}
      </div>

      {/* Stage Content Renderer */}
      <div style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
        
        {stage === 'explain' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--color-text-primary)' }}>
              {template.explain}
            </p>
          </div>
        )}

        {stage === 'demonstrate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--color-text-primary)' }}>
              {template.demonstrate}
            </p>
          </div>
        )}

        {stage === 'connect' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--color-text-primary)' }}>
              {template.connect}
            </p>
          </div>
        )}

        {stage === 'question' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
              {template.question}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Take a moment to formulate your answer mentally, then proceed to the active recall check.
            </p>
          </div>
        )}

        {stage === 'retrieve' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label" style={{ color: 'var(--color-accent)' }}>
              ACTIVE RECALL: Type your explanation from memory (no referencing back!)
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '110px', resize: 'none', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
              placeholder="What did you just learn? Summarize the concept rules in your own words..."
              value={retrievalInput}
              onChange={(e) => setRetrievalInput(e.target.value)}
            />
            <button onClick={submitRetrieval} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Submit Recall Check →
            </button>
          </div>
        )}

        {stage === 'apply' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label" style={{ color: 'var(--color-secondary-light)' }}>
              APPLICATION CHALLENGE
            </label>
            <p style={{ fontSize: '0.9rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
              {template.apply}
            </p>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '100px', resize: 'none', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
              placeholder="Type your design solution or code draft..."
              value={applyInput}
              onChange={(e) => setApplyInput(e.target.value)}
            />
            <button onClick={submitApply} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Submit Solution →
            </button>
          </div>
        )}

        {stage === 'correct' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span className="form-label">YOUR DRAFT SOLUTION</span>
                <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: 'var(--radius-sm)', minHeight: '80px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {applyInput}
                </div>
              </div>
              <div>
                <span className="form-label" style={{ color: 'var(--color-success)' }}>IDEAL ANALYSIS / COMPARISON</span>
                <div style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: 'var(--radius-sm)', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                  {template.idealAnswer}
                </div>
              </div>
            </div>

            {/* Self-Assessment Check */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>SELF-ASSESSMENT: HOW DID YOU DO?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('correct')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'correct' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'correct' ? '1px solid var(--color-success)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'correct' ? 'var(--color-success)' : 'var(--color-text-secondary)',
                  }}
                >
                  🎯 Nailed It
                </button>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('partial')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'partial' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'partial' ? '1px solid var(--color-warning)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'partial' ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                  }}
                >
                  ⚠️ Partial Gap
                </button>
                <button
                  type="button"
                  onClick={() => setSelfAssessment('wrong')}
                  className="btn"
                  style={{
                    fontSize: '0.8rem',
                    background: selfAssessment === 'wrong' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: selfAssessment === 'wrong' ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                    color: selfAssessment === 'wrong' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                  }}
                >
                  ❌ Made Mistake
                </button>
              </div>
            </div>

            {/* Mistake Bank Logger Inline */}
            {(selfAssessment === 'wrong' || selfAssessment === 'partial') && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(239,68,68,0.02)' }}>
                <span className="form-label" style={{ color: 'var(--color-danger)', marginBottom: 0 }}>LOG TO MISTAKE BANK</span>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Describe your mistake..."
                  value={mistakeText}
                  onChange={(e) => setMistakeText(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Why did you make it? (Cognitive bias/forgetfulness...)"
                    value={whyMade}
                    onChange={(e) => setWhyMade(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="How to avoid in the future?"
                    value={howToAvoid}
                    onChange={(e) => setHowToAvoid(e.target.value)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSaveAssessment}
              disabled={submitting}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-end' }}
            >
              {submitting ? 'Saving Assessment...' : '💾 Finalize Socratic Step'}
            </button>
          </div>
        )}

      </div>

      {/* Footer Nav Controls */}
      {stage !== 'retrieve' && stage !== 'apply' && stage !== 'correct' && (
        <button
          onClick={handleNextStage}
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-end', padding: '8px 16px', fontSize: '0.8rem', border: '1px solid var(--color-primary-light)', color: 'var(--color-primary-light)' }}
        >
          Next Step ➔
        </button>
      )}

    </div>
  );
}
