import React, { useState } from 'react';

interface Concept {
  id: string;
  title: string;
  parentId: string | null;
  status: string; // Mastery levels
  difficulty: 'Low' | 'Medium' | 'High';
  importance: 'Low' | 'Medium' | 'High';
}

interface KnowledgeMapProps {
  concepts: Concept[];
  topicTitle: string;
  onSaveConcepts: (updated: Concept[]) => void;
  onSelectConcept: (concept: Concept) => void;
  selectedConceptId?: string;
}

const MASTERY_COLORS: Record<string, string> = {
  Unknown: 'rgba(107, 114, 128, 0.2)', // Gray
  Exposed: 'rgba(99, 102, 241, 0.15)', // Indigo
  Understood: 'rgba(59, 130, 246, 0.15)', // Blue
  'Can Recall': 'rgba(168, 85, 247, 0.15)', // Purple
  'Can Apply': 'rgba(20, 184, 166, 0.15)', // Teal
  'Can Solve': 'rgba(236, 72, 153, 0.15)', // Pink
  'Can Explain': 'rgba(245, 158, 11, 0.15)', // Orange
  'Can Teach': 'rgba(16, 185, 129, 0.15)', // Emerald
  'Can Create': 'rgba(16, 185, 129, 0.25)', // Bright Emerald
};

const MASTERY_TEXT: Record<string, string> = {
  Unknown: '#9ca3af',
  Exposed: '#818cf8',
  Understood: '#60a5fa',
  'Can Recall': '#c084fc',
  'Can Apply': '#2dd4bf',
  'Can Solve': '#f472b6',
  'Can Explain': '#fb923c',
  'Can Teach': '#34d399',
  'Can Create': '#059669',
};

export default function KnowledgeMap({
  concepts,
  topicTitle,
  onSaveConcepts,
  onSelectConcept,
  selectedConceptId,
}: KnowledgeMapProps) {
  const [showAddConcept, setShowAddConcept] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newParent, setNewParent] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [importance, setImportance] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const handleAddConcept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newConcept: Concept = {
      id: Math.random().toString(36).substring(2, 9),
      title: newTitle.trim(),
      parentId: newParent || null,
      status: 'Unknown',
      difficulty,
      importance,
    };

    const updated = [...concepts, newConcept];
    onSaveConcepts(updated);
    
    setNewTitle('');
    setNewParent('');
    setShowAddConcept(false);
  };

  const handleDeleteConcept = (id: string) => {
    if (!confirm('Are you sure you want to remove this concept from the knowledge map?')) return;
    const updated = concepts.filter((c) => c.id !== id).map(c => {
      if (c.parentId === id) {
        return { ...c, parentId: null };
      }
      return c;
    });
    onSaveConcepts(updated);
  };

  // Pre-populate standard roadmap based on title heuristics
  const handlePrepopulatePath = () => {
    const titleLower = topicTitle.toLowerCase();
    let generated: Omit<Concept, 'id'>[] = [];

    if (titleLower.includes('system design') || titleLower.includes('backend') || titleLower.includes('architecture')) {
      generated = [
        { title: 'Distributed Fundamentals (CAP Theorem)', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Database Replication & Consistency', parentId: null, status: 'Unknown', difficulty: 'High', importance: 'High' },
        { title: 'Database Partitioning & Sharding', parentId: null, status: 'Unknown', difficulty: 'High', importance: 'High' },
        { title: 'Caching & Content Delivery Networks (CDN)', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
        { title: 'Message Queues & Event Streaming', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Load Balancing & Gateway Routers', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'Medium' },
      ];
    } else if (titleLower.includes('valuation') || titleLower.includes('finance') || titleLower.includes('financial')) {
      generated = [
        { title: 'Financial Statements Analysis', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Free Cash Flow calculation (FCFF/FCFE)', parentId: null, status: 'Unknown', difficulty: 'High', importance: 'High' },
        { title: 'Cost of Capital & WACC estimation', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Discounted Cash Flow (DCF) modelling', parentId: null, status: 'Unknown', difficulty: 'High', importance: 'High' },
        { title: 'Terminal Value & Enterprise Value pricing', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'Medium' },
      ];
    } else if (titleLower.includes('kubernetes') || titleLower.includes('docker') || titleLower.includes('container')) {
      generated = [
        { title: 'Containerization Basics & Dockerfiles', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
        { title: 'Kubernetes Pods & Workload Deployments', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Networking & Services (ClusterIP/NodePort)', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Persistent Storage & Volumes', parentId: null, status: 'Unknown', difficulty: 'High', importance: 'Medium' },
        { title: 'ConfigMaps & Secret management', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
      ];
    } else if (titleLower.includes('negotiation') || titleLower.includes('influence') || titleLower.includes('sales')) {
      generated = [
        { title: 'Tactical Empathy & Calibrated Questions', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
        { title: 'Mirroring & Labeling Techniques', parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
        { title: 'Accusation Audit & Anchoring', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'BATNA & Walkaway thresholds', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: 'Closing deals and handling objections', parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
      ];
    } else {
      // General Fallback
      generated = [
        { title: `${topicTitle} Fundamentals`, parentId: null, status: 'Unknown', difficulty: 'Low', importance: 'High' },
        { title: `Core Principles of ${topicTitle}`, parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: `Practical Application Scenarios`, parentId: null, status: 'Unknown', difficulty: 'Medium', importance: 'High' },
        { title: `Advanced Concepts & Optimization`, parentId: null, status: 'Unknown', difficulty: 'High', importance: 'Medium' },
        { title: `Final Capability Demonstration`, parentId: null, status: 'Unknown', difficulty: 'High', importance: 'High' },
      ];
    }

    // Build concepts with IDs and references
    const finalConcepts: Concept[] = [];
    generated.forEach((g) => {
      finalConcepts.push({
        id: Math.random().toString(36).substring(2, 9),
        title: g.title,
        parentId: g.parentId,
        status: g.status,
        difficulty: g.difficulty,
        importance: g.importance,
      });
    });

    onSaveConcepts(finalConcepts);
  };

  // Group concepts into roots and children
  const roots = concepts.filter((c) => !c.parentId);
  const childrenMap = new Map<string, Concept[]>();
  concepts.forEach((c) => {
    if (c.parentId) {
      const arr = childrenMap.get(c.parentId) || [];
      arr.push(c);
      childrenMap.set(c.parentId, arr);
    }
  });

  const renderConceptCard = (c: Concept, level: number = 0) => {
    const isSelected = selectedConceptId === c.id;
    const children = childrenMap.get(c.id) || [];
    const colorBg = MASTERY_COLORS[c.status] || MASTERY_COLORS.Unknown;
    const colorTxt = MASTERY_TEXT[c.status] || MASTERY_TEXT.Unknown;

    return (
      <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: `${level * 24}px` }}>
        <div
          className={`glass-card ${isSelected ? 'glass-panel-hover' : ''}`}
          style={{
            padding: '12px 16px',
            background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(25, 25, 35, 0.35)',
            border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onClick={() => onSelectConcept(c)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{c.title}</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  background: colorBg,
                  color: colorTxt,
                }}
              >
                {c.status}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                Diff: <strong style={{ color: 'var(--color-text-secondary)' }}>{c.difficulty}</strong>
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                Imp: <strong style={{ color: 'var(--color-text-secondary)' }}>{c.importance}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onSelectConcept(c)}
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.7rem' }}
            >
              🎓 Teach Me
            </button>
            <button
              onClick={() => handleDeleteConcept(c.id)}
              style={{ color: 'var(--color-danger)', fontSize: '1rem', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Render children recursively */}
        {children.map((child) => renderConceptCard(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🗺️</span> Knowledge Map Structure
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Select a concept node to launch the AI Socratic Tutor workspace.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {concepts.length === 0 && (
            <button
              onClick={handlePrepopulatePath}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--color-primary-light)' }}
            >
              ⚡ Auto-Generate Path
            </button>
          )}
          <button
            onClick={() => setShowAddConcept(!showAddConcept)}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
          >
            {showAddConcept ? 'Cancel' : '➕ Add Concept Node'}
          </button>
        </div>
      </div>

      {/* Add Concept Inline Form */}
      {showAddConcept && (
        <form onSubmit={handleAddConcept} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>CONCEPT TITLE</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. CAP Theorem Trade-offs"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              style={{ fontSize: '0.85rem', padding: '8px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>PARENT CONCEPT (DEPENDENCY)</label>
              <select
                className="form-input"
                value={newParent}
                onChange={(e) => setNewParent(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '8px', background: '#121218' }}
              >
                <option value="">None (Root Node)</option>
                {concepts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>DIFFICULTY</label>
              <select
                className="form-input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                style={{ fontSize: '0.85rem', padding: '8px', background: '#121218' }}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem' }}>IMPORTANCE</label>
              <select
                className="form-input"
                value={importance}
                onChange={(e) => setImportance(e.target.value as any)}
                style={{ fontSize: '0.85rem', padding: '8px', background: '#121218' }}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ padding: '8px', fontSize: '0.8rem' }}>
            Confirm Node Addition
          </button>
        </form>
      )}

      {/* Map Nodes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {roots.map((root) => renderConceptCard(root))}
        
        {concepts.length === 0 && (
          <div
            style={{
              padding: '48px 0',
              textAlign: 'center',
              border: '1px dashed var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              fontSize: '0.85rem',
            }}
          >
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>🗺️</span>
            Your Knowledge Map is empty. Generate a pre-populated learning path or add your own subtopic concept nodes to structure this topic.
          </div>
        )}
      </div>

    </div>
  );
}
