import { Edge, Node } from '@xyflow/react';

import { Layer, Pin, Position, Via } from '@/types/pcb';

export type NodeKind = 'component' | 'moduleInstance';

export type EditorNodeData = {
  kind: NodeKind;
  viewMode?: 'schematic' | 'layout';
  layoutMmToCanvas?: number;
  label: string;
  footprint: string;
  value?: string;
  lcscPartNumber?: string;
  manufacturerPartNumber?: string;
  partDescription?: string;
  rotation: number;
  layer: Layer;
  pins: Pin[];
  bounds: { width: number; height: number };
  moduleId?: string;
};

export type PcbFlowNode = Node<EditorNodeData, 'pcbNode'>;

export type TraceEdgeData = {
  traceWidthMm?: number;
  traceLayer?: Layer;
  gridSizeMm?: number;
  waypoints?: Position[];
  vias?: Via[];
};

export type PcbFlowEdge = Edge<TraceEdgeData, 'editableTrace' | 'default'>;
