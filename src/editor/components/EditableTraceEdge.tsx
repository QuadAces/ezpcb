import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  useReactFlow,
} from '@xyflow/react';
import * as React from 'react';

import { snapToGrid } from '@/core/pcbLayout';
import { PcbFlowEdge, PcbFlowNode } from '@/editor/types';

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export default function EditableTraceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
  markerEnd,
  style,
}: EdgeProps<PcbFlowEdge>) {
  const { getZoom, setEdges } = useReactFlow<PcbFlowNode, PcbFlowEdge>();
  const gridSizeMm = Math.max(1, data?.gridSizeMm ?? 5);
  const waypoints = React.useMemo(
    () => data?.waypoints ?? [],
    [data?.waypoints]
  );
  const points = React.useMemo(
    () => [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ],
    [sourceX, sourceY, targetX, targetY, waypoints]
  );

  const edgePath = React.useMemo(
    () =>
      points
        .map(
          (point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
        )
        .join(' '),
    [points]
  );

  const addViaAt = React.useCallback(
    (x: number, y: number) => {
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id !== id) {
            return edge;
          }

          const existing = edge.data?.vias ?? [];
          return {
            ...edge,
            data: {
              ...edge.data,
              vias: [
                ...existing,
                {
                  x: finite(x),
                  y: finite(y),
                  drillMm: 0.3,
                  padMm: 0.6,
                },
              ],
            },
          };
        })
      );
    },
    [id, setEdges]
  );

  const onDragControlPoint = React.useCallback(
    (waypointIndex: number, event: React.MouseEvent<SVGCircleElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const existingWaypoints = data?.waypoints ?? [];
      const initialPoint = existingWaypoints[waypointIndex] ?? {
        x: sourceX,
        y: sourceY,
      };

      const onMove = (moveEvent: MouseEvent) => {
        const zoom = getZoom() || 1;
        const deltaX = (moveEvent.clientX - startClientX) / zoom;
        const deltaY = (moveEvent.clientY - startClientY) / zoom;

        setEdges((edges) =>
          edges.map((edge) => {
            if (edge.id !== id) {
              return edge;
            }

            return {
              ...edge,
              data: {
                ...edge.data,
                waypoints: (edge.data?.waypoints ?? []).map((waypoint, index) =>
                  index === waypointIndex
                    ? snapToGrid(
                        {
                          x: finite(initialPoint.x + deltaX),
                          y: finite(initialPoint.y + deltaY),
                        },
                        gridSizeMm
                      )
                    : waypoint
                ),
              },
            };
          })
        );
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [data?.waypoints, getZoom, gridSizeMm, id, setEdges, sourceX, sourceY]
  );

  const addWaypointBetween = React.useCallback(
    (segmentIndex: number) => {
      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id !== id) {
            return edge;
          }

          const existing = edge.data?.waypoints ?? [];
          const segmentStart =
            segmentIndex === 0
              ? { x: sourceX, y: sourceY }
              : existing[segmentIndex - 1] ?? { x: sourceX, y: sourceY };
          const segmentEnd =
            segmentIndex === existing.length
              ? { x: targetX, y: targetY }
              : existing[segmentIndex] ?? { x: targetX, y: targetY };

          const nextPoint = snapToGrid(
            {
              x: finite((segmentStart.x + segmentEnd.x) / 2),
              y: finite((segmentStart.y + segmentEnd.y) / 2),
            },
            gridSizeMm
          );

          const nextWaypoints = [...existing];
          nextWaypoints.splice(segmentIndex, 0, nextPoint);

          return {
            ...edge,
            data: {
              ...edge.data,
              waypoints: nextWaypoints,
            },
          };
        })
      );
    },
    [gridSizeMm, id, setEdges, sourceX, sourceY, targetX, targetY]
  );

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <svg
          className='pointer-events-none absolute inset-0 overflow-visible'
          style={{ width: '100%', height: '100%' }}
        >
          {selected &&
            points.slice(0, -1).map((fromPoint, segmentIndex) => {
              const toPoint = points[segmentIndex + 1];
              const midX = (fromPoint.x + toPoint.x) / 2;
              const midY = (fromPoint.y + toPoint.y) / 2;

              return (
                <g key={`${id}-segment-${segmentIndex}`}>
                  <circle
                    className='pointer-events-auto cursor-pointer'
                    cx={midX}
                    cy={midY}
                    r={8}
                    fill='#ffffff'
                    stroke='#334155'
                    strokeWidth={1.2}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      addWaypointBetween(segmentIndex);
                    }}
                  />
                  <text
                    className='pointer-events-none select-none'
                    x={midX}
                    y={midY + 0.5}
                    textAnchor='middle'
                    dominantBaseline='middle'
                    fill='#334155'
                    fontSize='12'
                    fontWeight={700}
                  >
                    +
                  </text>
                </g>
              );
            })}
          {selected &&
            waypoints.map((point, waypointIndex) => (
              <circle
                key={`${id}-waypoint-${waypointIndex}`}
                className='pointer-events-auto cursor-grab'
                cx={point.x}
                cy={point.y}
                r={7}
                fill='#f59e0b'
                stroke='#92400e'
                strokeWidth={1.5}
                onMouseDown={(event) =>
                  onDragControlPoint(waypointIndex, event)
                }
                onDoubleClick={() => addViaAt(point.x, point.y)}
              />
            ))}
        </svg>
      </EdgeLabelRenderer>
    </>
  );
}
