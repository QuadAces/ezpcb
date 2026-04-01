import { Edge, Node } from '@xyflow/react';

import { Layer, Pin, Position, Via } from '@/types/pcb';

export type NodeKind = 'component' | 'moduleInstance' | 'textAnnotation';

export type EditorNodeData = {
  kind: NodeKind;
  annotationMode?: 'schematic' | 'layout';
  viewMode?: 'schematic' | 'layout';
  layoutMmToCanvas?: number;
  layoutVisualScale?: number;
  label: string;
  footprint: string;
  value?: string;
  lcscPartNumber?: string;
  manufacturerPartNumber?: string;
  partDescription?: string;
  textSizeMm?: number;
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
