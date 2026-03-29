'use client';

import { Handle, NodeProps, Position } from 'reactflow';

type ESP32Config = Record<string, string>;

const leftLabelStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-8px',
  top: '28%',
  transform: 'translate(-100%, -50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#166534',
  backgroundColor: '#ffffff',
  border: '1px solid #bbf7d0',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

const leftLabelSecondaryStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-8px',
  transform: 'translate(-100%, -50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#166534',
  backgroundColor: '#ffffff',
  border: '1px solid #bbf7d0',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

const rightLabelBaseStyle: React.CSSProperties = {
  position: 'absolute',
  right: '-8px',
  transform: 'translate(100%, -50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#166534',
  backgroundColor: '#ffffff',
  border: '1px solid #bbf7d0',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function ESP32(props: NodeProps) {
  const config = (props.data?.config ?? {}) as ESP32Config;

  const parsedPinCount = Number(config.pinCount ?? '10');
  const pinCount = Number.isFinite(parsedPinCount)
    ? Math.max(1, Math.min(40, Math.floor(parsedPinCount)))
    : 10;

  const pinStartY = 60;
  const pinSpacing = 26;
  const bodyHeight = Math.max(
    160,
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
        border: '2px solid #16a34a',
        borderRadius: '8px',
        backgroundColor: '#dcfce7',
        textAlign: 'center',
        width: '180px',
        minHeight: `${bodyHeight}px`,
        pointerEvents: 'auto',
      }}
    >
      <Handle
        type='target'
        position={Position.Left}
        id='vin'
        style={{ top: `${Math.max(44, pinStartY - 16)}px` }}
      />
      <span
        style={{
          ...leftLabelStyle,
          top: `${Math.max(44, pinStartY - 16)}px`,
        }}
      >
        Supply Voltage
      </span>

      <Handle
        type='target'
        position={Position.Left}
        id='gnd'
        style={{ top: `${Math.max(68, pinStartY + 8)}px` }}
      />
      <span
        style={{
          ...leftLabelSecondaryStyle,
          top: `${Math.max(68, pinStartY + 8)}px`,
        }}
      >
        GND
      </span>

      <div style={{ fontWeight: 'bold', color: '#166534' }}>ESP32</div>
      <div style={{ fontSize: '12px', color: '#166534' }}>
        {pinCount} GPIO Pins
      </div>

      {Array.from({ length: pinCount }, (_, index) => {
        const pinIndex = index + 1;
        const handleId = `gpio-${pinIndex}`;
        const top = getPinTop(index);
        const pinName = (config[`pinName_${pinIndex}`] ??
          `GPIO ${pinIndex}`) as string;

        return (
          <div key={handleId}>
            <Handle
              type='source'
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
