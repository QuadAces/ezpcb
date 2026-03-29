'use client';

import { Handle, NodeProps, Position } from 'reactflow';

const handleLabelBase: React.CSSProperties = {
  position: 'absolute',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#111827',
  backgroundColor: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function Ground(_: NodeProps) {
  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        border: '2px solid #4b5563',
        borderRadius: '8px',
        backgroundColor: '#f3f4f6',
        textAlign: 'center',
        width: '140px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#111827' }}>Ground</div>
      <div style={{ fontSize: '12px', color: '#374151' }}>0V Reference</div>

      <Handle
        type='source'
        position={Position.Right}
        id='groundOut'
        style={{ top: '50%' }}
      />
      <span
        style={{
          ...handleLabelBase,
          right: '-8px',
          top: '50%',
          transform: 'translate(100%, -50%)',
        }}
      >
        GND
      </span>
    </div>
  );
}
