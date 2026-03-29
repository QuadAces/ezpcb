'use client';

import { Handle, NodeProps, Position } from 'reactflow';

const handleLabelBase: React.CSSProperties = {
  position: 'absolute',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#7c2d12',
  backgroundColor: '#ffffff',
  border: '1px solid #fed7aa',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function BuckConverter(_: NodeProps) {
  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        border: '2px solid #ea580c',
        borderRadius: '8px',
        backgroundColor: '#fef3c7',
        textAlign: 'center',
        width: '150px',
        pointerEvents: 'auto',
      }}
    >
      <Handle type='target' position={Position.Left} id='vin' />
      <span
        style={{
          ...handleLabelBase,
          left: '-8px',
          top: '50%',
          transform: 'translate(-100%, -50%)',
        }}
      >
        Input Voltage
      </span>

      <div style={{ fontWeight: 'bold', color: '#92400e' }}>Buck Converter</div>
      <div style={{ fontSize: '12px', color: '#b45309' }}>DC-DC Step-Down</div>

      <Handle type='source' position={Position.Right} id='vout' />
      <span
        style={{
          ...handleLabelBase,
          right: '-8px',
          top: '50%',
          transform: 'translate(100%, -50%)',
        }}
      >
        Output Voltage
      </span>
    </div>
  );
}
