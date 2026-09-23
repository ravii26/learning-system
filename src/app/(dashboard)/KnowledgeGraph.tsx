'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { Concept } from './topics/[id]/KnowledgeMap';

interface Topic {
  id: string;
  title: string;
  area: string;
  status: string;
  knowledgeMap?: { concepts?: Concept[] } | any;
}

interface KnowledgeGraphProps {
  topics: Topic[];
}

interface GraphNode {
  id: string;
  label: string;
  type: 'core' | 'topic' | 'concept';
  x: number;
  y: number;
  color: string;
  size: number;
  status?: string;
  area?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

export default function KnowledgeGraph({ topics }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);

  useEffect(() => {
    // 1. Build Nodes and Links from topics data
    const tempNodes: GraphNode[] = [];
    const tempLinks: GraphLink[] = [];

    // Core central PLS node
    const coreId = 'core-learning-system';
    tempNodes.push({
      id: coreId,
      label: 'Learning OS',
      type: 'core',
      x: 250,
      y: 175,
      color: '#a855f7', // Glowing Purple
      size: 16,
    });

    const activeOrQueued = topics.filter(t => ['active', 'queued', 'maintenance'].includes(t.status));
    
    // Distribute Topic nodes in a circle around the core
    activeOrQueued.forEach((t, index) => {
      const angle = (index / activeOrQueued.length) * Math.PI * 2;
      const radius = 90;
      const topicX = 250 + Math.cos(angle) * radius;
      const topicY = 175 + Math.sin(angle) * radius;
      
      const topicColor = t.status === 'active' ? '#6366f1' : t.status === 'maintenance' ? '#10b981' : '#f59e0b';
      
      tempNodes.push({
        id: t.id,
        label: t.title.length > 25 ? t.title.substring(0, 22) + '...' : t.title,
        type: 'topic',
        x: topicX,
        y: topicY,
        color: topicColor,
        size: 10,
        area: t.area,
      });

      // Link topic to core
      tempLinks.push({ source: coreId, target: t.id });

      // Build child Concept nodes branching off this topic
      const map = t.knowledgeMap || { concepts: [] };
      const concepts = map.concepts || [];
      const validConcepts = concepts.slice(0, 4); // Limit concepts to avoid clutter

      validConcepts.forEach((c: any, cIdx: number) => {
        const subAngle = angle + ((cIdx - (validConcepts.length - 1) / 2) * (Math.PI / 6));
        const subRadius = 150;
        const conceptX = 250 + Math.cos(subAngle) * subRadius;
        const conceptY = 175 + Math.sin(subAngle) * subRadius;

        tempNodes.push({
          id: c.id,
          label: c.title.length > 20 ? c.title.substring(0, 18) + '...' : c.title,
          type: 'concept',
          x: conceptX,
          y: conceptY,
          color: '#14b8a6', // Teal
          size: 6,
          status: c.status,
        });

        // Link concept to topic
        tempLinks.push({ source: t.id, target: c.id });
      });
    });

    setNodes(tempNodes);
    setLinks(tempLinks);
  }, [topics]);

  // Handle Canvas Drawing and Interaction
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw glowing lines (Links)
      links.forEach((l) => {
        const sourceNode = nodes.find(n => n.id === l.source);
        const targetNode = nodes.find(n => n.id === l.target);
        if (!sourceNode || !targetNode) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        
        // Dynamic gradients for connections
        const grad = ctx.createLinearGradient(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
        grad.addColorStop(0, sourceNode.color);
        grad.addColorStop(1, targetNode.color);
        
        ctx.strokeStyle = grad;
        ctx.lineWidth = sourceNode.type === 'core' ? 1.5 : 1;
        ctx.globalAlpha = 0.25;
        ctx.stroke();
      });

      // Draw Nodes
      nodes.forEach((n) => {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        
        // Add subtle drop shadow glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Draw small text labels next to core/topic nodes
        if (n.type !== 'concept') {
          ctx.fillStyle = '#f3f4f6';
          ctx.font = n.type === 'core' ? 'bold 10px sans-serif' : '500 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y - n.size - 4);
        }
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, links]);

  // Hover detector
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let found: GraphNode | null = null;
    for (const n of nodes) {
      const dist = Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2);
      if (dist <= n.size + 8) { found = n; break; }
    }
    setHoverNode(found);
    setHoverPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };

  // Click detector
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // Account for canvas actual coordinates scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if clicked any node
    let clicked: GraphNode | null = null;
    for (const n of nodes) {
      const dist = Math.sqrt((n.x - clickX) ** 2 + (n.y - clickY) ** 2);
      if (dist <= n.size + 6) {
        clicked = n;
        break;
      }
    }

    setSelectedNode(clicked);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🕸️</span> Personal Knowledge Web
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Interactive map connecting active subjects to their Socratic sub-concepts. Click nodes to inspect.
        </p>
      </div>

      <div style={{ position: 'relative', width: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={500}
          height={350}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={() => setHoverNode(null)}
          style={{ width: '100%', display: 'block', cursor: hoverNode ? 'pointer' : 'default' }}
        />

        {/* Hover tooltip */}
        {hoverNode && (
          <div style={{
            position: 'absolute',
            left: `${hoverPos.x + 12}px`,
            top: `${hoverPos.y - 12}px`,
            background: 'rgba(12,12,20,0.96)',
            border: `1px solid ${hoverNode.color}44`,
            borderLeft: `3px solid ${hoverNode.color}`,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            pointerEvents: 'none',
            zIndex: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{ fontWeight: 600, color: '#fff' }}>{hoverNode.label}</span>
            {hoverNode.area && <span style={{ marginLeft: '6px', color: 'var(--color-text-muted)', fontSize: '0.68rem' }}>{hoverNode.area}</span>}
            {hoverNode.status && <span style={{ display: 'block', color: 'var(--color-secondary-light)', fontSize: '0.68rem', marginTop: '1px' }}>{hoverNode.status}</span>}
          </div>
        )}

        {/* Selected node card detail overlay */}
        {selectedNode && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
            background: 'rgba(18, 18, 24, 0.95)',
            border: '1px solid var(--border-color)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            boxShadow: 'var(--shadow-glass)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: selectedNode.color, textTransform: 'uppercase', display: 'block' }}>
                {selectedNode.type} node
              </span>
              <strong style={{ fontSize: '0.85rem' }}>{selectedNode.label}</strong>
              {selectedNode.status && (
                <p style={{ color: 'var(--color-secondary-light)', fontSize: '0.75rem', marginTop: '2px' }}>
                  Mastery status: {selectedNode.status}
                </p>
              )}
              {selectedNode.area && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                  Domain Area: {selectedNode.area}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ padding: '4px', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', padding: '4px 0' }}>
        {[
          { color: '#a855f7', label: 'Core' },
          { color: '#6366f1', label: 'Active' },
          { color: '#f59e0b', label: 'Queued' },
          { color: '#10b981', label: 'Maintained' },
          { color: '#14b8a6', label: 'Concept' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', boxShadow: `0 0 5px ${color}88`, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>

    </div>
  );
}
