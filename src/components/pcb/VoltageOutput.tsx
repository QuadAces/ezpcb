'use client';

import { Handle, NodeProps, Position } from 'reactflow';

type VoltageSupplyConfig = Record<string, string>;

const handleLabelBase: React.CSSProperties = {
  position: 'absolute',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#0f766e',
  backgroundColor: '#ffffff',
  border: '1px solid #99f6e4',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function VoltageOutput(props: NodeProps) {
  const config = (props.data?.config ?? {}) as VoltageSupplyConfig;
  const supplyInputType = config.supplyInputType || 'USB-C';

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        border: '2px solid #14b8a6',
        borderRadius: '8px',
        backgroundColor: '#ccfbf1',
        textAlign: 'center',
        width: '150px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#0d9488' }}>Voltage Supply</div>
      <div style={{ fontSize: '12px', color: '#0f766e' }}>
        {supplyInputType}
      </div>

      <Handle
        type='source'
        position={Position.Right}
        id='voltageOut'
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
        Output Voltage
      </span>
    </div>
  );
}
