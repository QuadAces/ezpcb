import { Handle, NodeProps, Position } from '@xyflow/react';
import * as React from 'react';

import { PcbFlowNode } from '@/editor/types';

type PcbNodeProps = NodeProps<PcbFlowNode>;

type PadSide = 'left' | 'right' | 'top' | 'bottom';

type PadAnchor = {
  id: string;
  side: PadSide;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distributePinsAcrossSides(
  count: number,
  bodyWidth: number,
  bodyHeight: number
) {
  if (count <= 1) {
    return { left: 0, right: 1, top: 0, bottom: 0 };
  }

  if (count === 2) {
    return { left: 1, right: 1, top: 0, bottom: 0 };
  }

  if (count === 3) {
    return { left: 1, right: 1, top: 1, bottom: 0 };
  }

  const sideOrder: PadSide[] = ['top', 'right', 'bottom', 'left'];
  const sideLengths: Record<PadSide, number> = {
    top: bodyWidth,
    bottom: bodyWidth,
    left: bodyHeight,
    right: bodyHeight,
  };

  const totalLength =
    sideLengths.top + sideLengths.bottom + sideLengths.left + sideLengths.right;

  const base: Record<PadSide, number> = {
    top: Math.floor((count * sideLengths.top) / totalLength),
    right: Math.floor((count * sideLengths.right) / totalLength),
    bottom: Math.floor((count * sideLengths.bottom) / totalLength),
    left: Math.floor((count * sideLengths.left) / totalLength),
  };

  if (count >= 4) {
    sideOrder.forEach((side) => {
      if (base[side] === 0) {
        base[side] = 1;
      }
    });
  }

  const assigned = base.top + base.right + base.bottom + base.left;
  let remaining = count - assigned;

  const ranking = sideOrder
    .map((side) => {
      const exact = (count * sideLengths[side]) / totalLength;
      return { side, frac: exact - Math.floor(exact) };
    })
    .sort((a, b) => b.frac - a.frac);

  let rankIndex = 0;
  while (remaining > 0) {
    const side = ranking[rankIndex % ranking.length].side;
    base[side] += 1;
    remaining -= 1;
    rankIndex += 1;
  }

  while (remaining < 0) {
    const candidates = sideOrder.filter((side) => base[side] > 1);
    if (candidates.length === 0) {
      break;
    }
    const side = candidates[rankIndex % candidates.length];
    base[side] -= 1;
    remaining += 1;
    rankIndex += 1;
  }

  return {
    left: base.left,
    right: base.right,
    top: base.top,
    bottom: base.bottom,
  };
}

function createPadAnchors(
  pins: PcbFlowNode['data']['pins'],
  bodyWidth: number,
  bodyHeight: number
): PadAnchor[] {
  const counts = distributePinsAcrossSides(pins.length, bodyWidth, bodyHeight);
  const sides: PadSide[] = [];

  for (let i = 0; i < counts.top; i += 1) sides.push('top');
  for (let i = 0; i < counts.right; i += 1) sides.push('right');
  for (let i = 0; i < counts.bottom; i += 1) sides.push('bottom');
  for (let i = 0; i < counts.left; i += 1) sides.push('left');

  const bySide: Record<PadSide, string[]> = {
    top: [],
    right: [],
    bottom: [],
    left: [],
  };

  pins.forEach((pin, index) => {
    const side = sides[index % sides.length] ?? 'right';
    bySide[side].push(pin.id);
  });

  const anchors: PadAnchor[] = [];

  (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
    const sidePins = bySide[side];
    sidePins.forEach((pinId, index) => {
      const t = (index + 1) / (sidePins.length + 1);
      const x =
        side === 'left' ? 0 : side === 'right' ? bodyWidth : t * bodyWidth;
      const y =
        side === 'top' ? 0 : side === 'bottom' ? bodyHeight : t * bodyHeight;

      anchors.push({
        id: pinId,
        side,
        x,
        y,
      });
    });
  });

  return anchors;
}

export default function PcbNode({ data, selected }: PcbNodeProps) {
  const isTextAnnotation = data.kind === 'textAnnotation';
  const isLayoutComponent =
    data.viewMode === 'layout' && data.kind === 'component';

  if (isTextAnnotation) {
    const mmToCanvas = data.layoutMmToCanvas ?? 1;
    const fontSizePx = Math.max(10, (data.textSizeMm ?? 1.6) * mmToCanvas * 5);

    return (
      <div
        className='relative select-none'
        style={{
          fontSize: fontSizePx,
          lineHeight: 1,
          color: data.layer === 'top' ? '#7f1d1d' : '#1e3a8a',
          textShadow: selected ? '0 0 0.5px #111827' : 'none',
        }}
      >
        {data.label}
      </div>
    );
  }

  if (isLayoutComponent) {
    const mmToCanvas = data.layoutMmToCanvas ?? 1;
    const layoutVisualScale = data.layoutVisualScale ?? 10;
    const bodyWidth = Math.max(
      28,
      data.bounds.width * mmToCanvas * layoutVisualScale
    );
    const bodyHeight = Math.max(
      20,
      data.bounds.height * mmToCanvas * layoutVisualScale
    );
    const padLength = clamp(Math.min(bodyWidth, bodyHeight) * 0.2, 4, 14);
    const padThickness = clamp(Math.min(bodyWidth, bodyHeight) * 0.16, 3, 10);
    const labelFontSize = clamp(Math.min(bodyWidth, bodyHeight) * 0.28, 9, 22);
    const labelYOffset = labelFontSize * 0.35;
    const width = bodyWidth;
    const height = bodyHeight;

    const padAnchors = createPadAnchors(data.pins, bodyWidth, bodyHeight);

    return (
      <div
        className={`relative shadow-sm ${
          selected ? 'ring-2 ring-blue-500/60' : ''
        }`}
        style={{ width, height }}
      >
        <svg
          width={width}
          height={height}
          className='pointer-events-none overflow-visible'
        >
          <rect
            x={0}
            y={0}
            rx={Math.min(6, bodyWidth * 0.14)}
            ry={Math.min(6, bodyHeight * 0.14)}
            width={bodyWidth}
            height={bodyHeight}
            fill={data.layer === 'top' ? '#ffe4e6' : '#dbeafe'}
            stroke={data.layer === 'top' ? '#dc2626' : '#2563eb'}
            strokeWidth={1.5}
          />
          {padAnchors.map((anchor) => {
            const isHorizontal =
              anchor.side === 'left' || anchor.side === 'right';
            const padW = isHorizontal ? padLength : padThickness;
            const padH = isHorizontal ? padThickness : padLength;
            const x = anchor.x - padW / 2;
            const y = anchor.y - padH / 2;

            return (
              <rect
                key={`${data.label}-${anchor.id}-pad`}
                x={x}
                y={y}
                width={padW}
                height={padH}
                rx={1.5}
                ry={1.5}
                fill='#f8fafc'
                stroke='#475569'
                strokeWidth={1}
              />
            );
          })}
          <text
            x={width / 2}
            y={height / 2 + labelYOffset}
            textAnchor='middle'
            style={{ fontSize: labelFontSize }}
            className='select-none fill-slate-800 font-semibold'
          >
            {data.label}
          </text>
        </svg>
        {padAnchors.map((anchor) => {
          return (
            <React.Fragment key={anchor.id}>
              <Handle
                id={anchor.id}
                type='target'
                position={Position.Left}
                style={{
                  left: anchor.x,
                  top: anchor.y,
                  width: 1,
                  height: 1,
                  opacity: 0,
                  border: 'none',
                  background: 'transparent',
                  pointerEvents: 'none',
                }}
              />
              <Handle
                id={anchor.id}
                type='source'
                position={Position.Left}
                style={{
                  left: anchor.x,
                  top: anchor.y,
                  width: 1,
                  height: 1,
                  opacity: 0,
                  border: 'none',
                  background: 'transparent',
                  pointerEvents: 'none',
                }}
              />
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  const schematicBodyWidth = 172;
  const schematicBodyHeight = 96;
  const schematicMargin = 14;
  const schematicWidth = schematicBodyWidth + schematicMargin * 2;
  const schematicHeight = schematicBodyHeight + schematicMargin * 2;
  const schematicAnchors = createPadAnchors(
    data.pins,
    schematicBodyWidth,
    schematicBodyHeight
  ).map((anchor) => ({
    ...anchor,
    x: anchor.x + schematicMargin,
    y: anchor.y + schematicMargin,
  }));

  return (
    <div
      className={`relative rounded-md border bg-white text-xs shadow-sm ${
        selected ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
      }`}
      style={{ width: schematicWidth, height: schematicHeight }}
    >
      <svg
        width={schematicWidth}
        height={schematicHeight}
        className='pointer-events-none absolute inset-0'
      >
        <rect
          x={schematicMargin}
          y={schematicMargin}
          width={schematicBodyWidth}
          height={schematicBodyHeight}
          rx={8}
          ry={8}
          fill={selected ? '#eff6ff' : '#ffffff'}
          stroke={selected ? '#2563eb' : '#9ca3af'}
          strokeWidth={1.5}
        />
        {schematicAnchors.map((anchor) => (
          <circle
            key={`${data.label}-${anchor.id}-anchor`}
            cx={anchor.x}
            cy={anchor.y}
            r={3}
            fill='#0f172a'
          />
        ))}
      </svg>

      <div className='absolute inset-[18px] flex flex-col justify-between'>
        <div className='border-b border-gray-200 pb-1'>
          <p className='font-semibold'>{data.label}</p>
          <p className='text-[11px] text-gray-600'>{data.footprint}</p>
        </div>
        <p className='text-[11px] text-gray-600'>{data.pins.length} pins</p>
      </div>

      {schematicAnchors.map((anchor) => (
        <React.Fragment key={anchor.id}>
          <Handle
            id={anchor.id}
            type='target'
            position={Position.Left}
            style={{
              left: anchor.x,
              top: anchor.y,
              width: 8,
              height: 8,
              opacity: 0,
              border: 'none',
              background: 'transparent',
            }}
          />
          <Handle
            id={anchor.id}
            type='source'
            position={Position.Left}
            style={{
              left: anchor.x,
              top: anchor.y,
              width: 8,
              height: 8,
              opacity: 0,
              border: 'none',
              background: 'transparent',
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}
