'use client';

import { Handle, NodeProps, Position } from 'reactflow';

const handleLabelBase: React.CSSProperties = {
  position: 'absolute',
  transform: 'translateY(-50%)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.01em',
  color: '#1e3a8a',
  backgroundColor: '#ffffff',
  border: '1px solid #bfdbfe',
  borderRadius: '9999px',
  padding: '2px 8px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
};

export default function RFIDModule(_: NodeProps) {
  const leftPins = [
    { id: 'vcc', label: 'Voltage Input', handleType: 'target' as const },
    { id: 'gnd', label: 'GND', handleType: 'target' as const },
    { id: 'sda', label: 'SDA / SS', handleType: 'source' as const },
    { id: 'sck', label: 'SCK', handleType: 'source' as const },
    { id: 'mosi', label: 'MOSI', handleType: 'source' as const },
    { id: 'rst', label: 'RST', handleType: 'source' as const },
  ];

  const rightPins = [
    { id: 'miso', label: 'MISO' },
    { id: 'irq', label: 'IRQ' },
  ];

  const pinStartY = 54;
  const pinSpacing = 24;
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const bodyHeight = Math.max(170, pinStartY + (maxPins - 1) * pinSpacing + 26);

  return (
    <div
      style={{
        position: 'relative',
        padding: '12px 16px',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        backgroundColor: '#dbeafe',
        textAlign: 'center',
        width: '190px',
        minHeight: `${bodyHeight}px`,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#1e40af' }}>RFID Module</div>
      <div style={{ fontSize: '12px', color: '#1e3a8a' }}>RC522 SPI Pins</div>

      {leftPins.map((pin, index) => {
        const top = `${pinStartY + index * pinSpacing}px`;

        return (
          <div key={pin.id}>
            <Handle
              type={pin.handleType}
              position={Position.Left}
              id={pin.id}
              style={{ top }}
            />
            <span
              style={{
                ...handleLabelBase,
                left: '-8px',
                top,
                transform: 'translate(-100%, -50%)',
              }}
            >
              {pin.label}
            </span>
          </div>
        );
      })}

      {rightPins.map((pin, index) => {
        const top = `${pinStartY + index * pinSpacing}px`;

        return (
          <div key={pin.id}>
            <Handle
              type='source'
              position={Position.Right}
              id={pin.id}
              style={{ top }}
            />
            <span
              style={{
                ...handleLabelBase,
                right: '-8px',
                top,
                transform: 'translate(100%, -50%)',
              }}
            >
              {pin.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
