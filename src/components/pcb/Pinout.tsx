'use client';

import { Handle, NodeProps, Position } from 'reactflow';

type PinoutConfig = Record<string, string>;

type PinType = 'voltage-in' | 'voltage-out' | 'gpio' | 'gnd';

function getPinType(config: PinoutConfig, pinIndex: number): PinType {
  const configuredType = config[`pinType_${pinIndex}`];
  if (
    configuredType === 'voltage-in' ||
    configuredType === 'voltage-out' ||
    configuredType === 'gpio' ||
    configuredType === 'gnd'
  ) {
    return configuredType;
  }

  return 'gpio';
}

const rightLabelBaseStyle: React.CSSProperties = {
  position: 'absolute',
  right: '-8px',
  transform: 'translate(100%, -50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#1f2937',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function Pinout(props: NodeProps) {
  const config = (props.data?.config ?? {}) as PinoutConfig;

  const parsedPinCount = Number(config.pinCount ?? '8');
  const pinCount = Number.isFinite(parsedPinCount)
    ? Math.max(1, Math.min(40, Math.floor(parsedPinCount)))
    : 8;

  const pinStartY = 58;
  const pinSpacing = 26;
  const bodyHeight = Math.max(
    150,
    pinStartY + (pinCount - 1) * pinSpacing + 30
  );

  const getPinTop = (index: number) => {
    return pinStartY + index * pinSpacing;
  };

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        border: '2px solid #334155',
        borderRadius: '8px',
        backgroundColor: '#e2e8f0',
        textAlign: 'center',
        width: '176px',
        minHeight: `${bodyHeight}px`,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#0f172a' }}>Header Pins</div>
      <div style={{ fontSize: '12px', color: '#334155' }}>
        {pinCount} Configurable Pins
      </div>

      {Array.from({ length: pinCount }, (_, index) => {
        const pinIndex = index + 1;
        const handleId = `pin-${pinIndex}`;
        const top = getPinTop(index);
        const pinName = (config[`pinName_${pinIndex}`] ??
          `Pin ${pinIndex}`) as string;
        const pinType = getPinType(config, pinIndex);
        const handleType = pinType === 'voltage-out' ? 'source' : 'target';

        return (
          <div key={handleId}>
            <Handle
              type={handleType}
              position={Position.Right}
              id={handleId}
              style={{ top: `${top}px` }}
            />
            <span
              style={{
                ...rightLabelBaseStyle,
                top: `${top}px`,
              }}
            >
              {pinName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
