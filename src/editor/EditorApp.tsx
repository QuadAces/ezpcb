'use client';

import {
  addEdge,
  Background,
  Connection,
  Controls,
  MiniMap,
  OnSelectionChangeParams,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ViewportPortal,
} from '@xyflow/react';
import * as React from 'react';

import { JlcPart } from '@/library/jlcParts';

import { flattenProject } from '@/core/flatten';
import { detectCollisions, snapToGrid } from '@/core/pcbLayout';
import { COMPONENT_LIBRARY, createCatalogComponent } from '@/editor/catalog';
import EditableTraceEdge from '@/editor/components/EditableTraceEdge';
import PcbNode from '@/editor/components/PcbNode';
import { buildNets, buildProjectFromEditor } from '@/editor/serialization';
import { EditorNodeData, PcbFlowEdge, PcbFlowNode } from '@/editor/types';

import { Module } from '@/types/pcb';

const STORAGE_KEY = 'pcb-editor-state-v1';

const nodeTypes = {
  pcbNode: PcbNode,
};

const edgeTypes = {
  editableTrace: EditableTraceEdge,
};

type EditorMode = 'schematic' | 'layout';

type PersistedEditorState = {
  nodes: PcbFlowNode[];
  edges: PcbFlowEdge[];
  moduleLibrary: Record<string, Module>;
  designatorCount: number;
  schematicPositions?: Record<string, { x: number; y: number }>;
  layoutPositions?: Record<string, { x: number; y: number }>;
  boardCenter?: { x: number; y: number };
  boardWidthMm?: number;
  boardHeightMm?: number;
  boardFitMarginMm?: number;
  gerberSilkStrokeMm?: number;
  showBoardReference?: boolean;
};

function createInitialState(): PersistedEditorState {
  const r1 = createCatalogComponent(0, 'cmp_r1', 1, { x: 80, y: 120 });
  const u1 = createCatalogComponent(2, 'cmp_u1', 1, { x: 280, y: 120 });
  const c1 = createCatalogComponent(1, 'cmp_c1', 1, { x: 280, y: 260 });

  return {
    nodes: [r1, u1, c1].map((component) => ({
      id: component.id,
      type: 'pcbNode',
      position: component.position,
      data: {
        kind: 'component',
        label: component.designator,
        footprint: component.footprint,
        value: component.value,
        rotation: component.rotation,
        layer: component.layer,
        pins: component.pins,
        bounds: component.bounds,
      },
    })),
    edges: [
      {
        id: 'e-r1-u1-vcc',
        type: 'editableTrace',
        source: 'cmp_r1',
        sourceHandle: '1',
        target: 'cmp_u1',
        targetHandle: 'VCC',
        data: {
          traceWidthMm: 0.25,
          traceLayer: 'top',
          waypoints: [],
          vias: [],
        },
      },
      {
        id: 'e-c1-u1-gnd',
        type: 'editableTrace',
        source: 'cmp_c1',
        sourceHandle: '2',
        target: 'cmp_u1',
        targetHandle: 'GND',
        data: {
          traceWidthMm: 0.25,
          traceLayer: 'bottom',
          waypoints: [],
          vias: [],
        },
      },
    ],
    moduleLibrary: {},
    designatorCount: 3,
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getPinToken(nodeId: string, pinId: string) {
  return `${nodeId}:${pinId}`;
}

function createPositionMap(nodes: PcbFlowNode[]) {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
  );
}

function EditorShell() {
  const layoutMmToCanvas = 1;
  const layoutVisualScale = 10;
  const { screenToFlowPosition, setCenter } = useReactFlow<
    PcbFlowNode,
    PcbFlowEdge
  >();
  const initial = React.useMemo(createInitialState, []);
  const [nodes, setNodes, onNodesChange] = useNodesState<PcbFlowNode>(
    initial.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<PcbFlowEdge>(
    initial.edges
  );
  const [moduleLibrary, setModuleLibrary] = React.useState<
    Record<string, Module>
  >(initial.moduleLibrary);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<string[]>([]);
  const [, setSelectedEdgeIds] = React.useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = React.useState<string | null>(
    initial.nodes[0]?.id ?? null
  );
  const [activeEdgeId, setActiveEdgeId] = React.useState<string | null>(null);
  const [designatorCount, setDesignatorCount] = React.useState(
    initial.designatorCount
  );
  const [schematicPositions, setSchematicPositions] = React.useState<
    Record<string, { x: number; y: number }>
  >(createPositionMap(initial.nodes));
  const [layoutPositions, setLayoutPositions] = React.useState<
    Record<string, { x: number; y: number }>
  >(createPositionMap(initial.nodes));
  const [gridSizeMm, setGridSizeMm] = React.useState(5);
  const [status, setStatus] = React.useState('Ready');
  const [jlcQuery, setJlcQuery] = React.useState('');
  const [jlcResults, setJlcResults] = React.useState<JlcPart[]>([]);
  const [jlcSearching, setJlcSearching] = React.useState(false);
  const [catalogQuery, setCatalogQuery] = React.useState('');
  const [catalogResults, setCatalogResults] = React.useState<JlcPart[]>([]);
  const [catalogSearching, setCatalogSearching] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<EditorMode>('schematic');
  const [showTopLayer, setShowTopLayer] = React.useState(true);
  const [showBottomLayer, setShowBottomLayer] = React.useState(true);
  const [showBoardReference, setShowBoardReference] = React.useState(true);
  const [boardCenter, setBoardCenter] = React.useState({ x: 200, y: 180 });
  const [boardWidthMm, setBoardWidthMm] = React.useState(100);
  const [boardHeightMm, setBoardHeightMm] = React.useState(80);
  const [boardFitMarginMm, setBoardFitMarginMm] = React.useState(10);
  const [gerberSilkStrokeMm, setGerberSilkStrokeMm] = React.useState(0.06);
  const [layoutViewZoom, setLayoutViewZoom] = React.useState(6);

  React.useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedEditorState;
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setModuleLibrary(parsed.moduleLibrary ?? {});
      setDesignatorCount(parsed.designatorCount ?? designatorCount);
      setSchematicPositions(
        parsed.schematicPositions ?? createPositionMap(parsed.nodes)
      );
      setLayoutPositions(
        parsed.layoutPositions ?? createPositionMap(parsed.nodes)
      );
      setBoardCenter(parsed.boardCenter ?? { x: 200, y: 180 });
      setBoardWidthMm(parsed.boardWidthMm ?? 100);
      setBoardHeightMm(parsed.boardHeightMm ?? 80);
      setBoardFitMarginMm(parsed.boardFitMarginMm ?? 10);
      setGerberSilkStrokeMm(parsed.gerberSilkStrokeMm ?? 0.06);
      setShowBoardReference(parsed.showBoardReference ?? true);
    } catch {
      setStatus('Failed to load saved design');
    }
  }, [setEdges, setNodes, designatorCount]);

  React.useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const nextPosition =
          editorMode === 'layout'
            ? layoutPositions[node.id] ?? node.position
            : schematicPositions[node.id] ?? node.position;

        return {
          ...node,
          position: nextPosition,
        };
      })
    );
  }, [editorMode, layoutPositions, schematicPositions, setNodes]);

  React.useEffect(() => {
    if (editorMode !== 'layout') {
      return;
    }

    setCenter(boardCenter.x, boardCenter.y, {
      zoom: layoutViewZoom,
      duration: 250,
    });
  }, [boardCenter.x, boardCenter.y, editorMode, layoutViewZoom, setCenter]);

  const onConnect = React.useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: `e_${crypto.randomUUID()}`,
            type: 'editableTrace',
            data: {
              traceWidthMm: 0.25,
              traceLayer: editorMode === 'layout' ? 'top' : 'top',
              waypoints: [],
              vias: [],
            },
          },
          current
        )
      );
    },
    [editorMode, setEdges]
  );

  const onSelectionChange = React.useCallback(
    (selection: OnSelectionChangeParams) => {
      const selectedIds = (selection.nodes ?? []).map((node) => node.id);
      const selectedEdgeList = (selection.edges ?? []).map((edge) => edge.id);
      setSelectedNodeIds(selectedIds);
      setSelectedEdgeIds(selectedEdgeList);
      if (selectedIds.length > 0) {
        setActiveNodeId(selectedIds[0]);
        setActiveEdgeId(null);
      } else if (selectedEdgeList.length > 0) {
        setActiveEdgeId(selectedEdgeList[0]);
        setActiveNodeId(null);
      }
    },
    []
  );

  const activeNode = React.useMemo(
    () => nodes.find((node) => node.id === activeNodeId) ?? null,
    [nodes, activeNodeId]
  );

  const activeEdge = React.useMemo(
    () => edges.find((edge) => edge.id === activeEdgeId) ?? null,
    [activeEdgeId, edges]
  );

  const getPinAnchor = React.useCallback(
    (node: PcbFlowNode, pinId: string, side: 'left' | 'right') => {
      const pinIndex = node.data.pins.findIndex((pin) => pin.id === pinId);
      const normalizedIndex =
        pinIndex < 0 ? 0.5 : (pinIndex + 1) / (node.data.pins.length + 1);
      const xOffset =
        side === 'left'
          ? -node.data.bounds.width / 2
          : node.data.bounds.width / 2;
      const yOffset = (normalizedIndex - 0.5) * node.data.bounds.height;

      return {
        x: node.position.x + xOffset,
        y: node.position.y + yOffset,
      };
    },
    []
  );

  const { nets: derivedNets, pinNetMap } = React.useMemo(
    () => buildNets(nodes, edges),
    [nodes, edges]
  );

  const nodeById = React.useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const netLabelByEdgeId = React.useMemo(() => {
    const labels = new Map<string, string>();
    edges.forEach((edge) => {
      if (!edge.sourceHandle && !edge.targetHandle) {
        return;
      }

      const sourceToken = edge.sourceHandle
        ? getPinToken(edge.source, edge.sourceHandle)
        : null;
      const targetToken = edge.targetHandle
        ? getPinToken(edge.target, edge.targetHandle)
        : null;

      const sourceNet = sourceToken ? pinNetMap.get(sourceToken) : undefined;
      const targetNet = targetToken ? pinNetMap.get(targetToken) : undefined;
      const netName = sourceNet ?? targetNet;

      if (netName) {
        labels.set(edge.id, netName);
      }
    });

    return labels;
  }, [edges, pinNetMap]);

  const visibleNodes = React.useMemo(() => {
    const modeFiltered = nodes.filter((node) => {
      if (node.data.kind !== 'textAnnotation') {
        return true;
      }

      const annotationMode = node.data.annotationMode ?? 'layout';
      return annotationMode === editorMode;
    });

    const layerFiltered =
      editorMode === 'layout'
        ? modeFiltered.filter((node) => {
            if (node.data.kind !== 'component') {
              return true;
            }

            if (node.data.layer === 'top') {
              return showTopLayer;
            }

            return showBottomLayer;
          })
        : modeFiltered;

    if (editorMode === 'schematic') {
      return layerFiltered.map((node) => ({
        ...node,
        data: {
          ...node.data,
          viewMode: 'schematic' as const,
          layoutMmToCanvas,
          layoutVisualScale,
        },
      }));
    }

    return layerFiltered.map((node) => {
      const isTop = node.data.layer === 'top';
      return {
        ...node,
        data: {
          ...node.data,
          viewMode: 'layout' as const,
          layoutMmToCanvas,
          layoutVisualScale,
        },
        style: {
          ...node.style,
          ...(node.data.kind === 'component'
            ? {
                borderColor: isTop ? '#dc2626' : '#2563eb',
                backgroundColor: isTop ? '#fee2e2' : '#dbeafe',
              }
            : {}),
        },
      };
    });
  }, [
    editorMode,
    layoutMmToCanvas,
    layoutVisualScale,
    nodes,
    showBottomLayer,
    showTopLayer,
  ]);

  const visibleNodeIds = React.useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );

  const renderedEdges = React.useMemo<PcbFlowEdge[]>(() => {
    return edges
      .filter(
        (edge) =>
          visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
      )
      .map((edge): PcbFlowEdge => {
        const netName = netLabelByEdgeId.get(edge.id);
        const traceLayer = edge.data?.traceLayer ?? 'top';
        const layerColor = traceLayer === 'top' ? '#dc2626' : '#2563eb';

        if (editorMode === 'schematic') {
          return {
            ...edge,
            type: 'default' as const,
            animated: true,
            label: netName,
            style: {
              stroke: '#1f2937',
              strokeWidth: 1.5,
            },
          };
        }

        return {
          ...edge,
          type: 'editableTrace' as const,
          animated: false,
          label: netName,
          data: {
            ...edge.data,
            gridSizeMm,
          },
          style: {
            stroke: layerColor,
            strokeWidth: Math.max(1, (edge.data?.traceWidthMm ?? 0.25) * 4),
          },
        };
      });
  }, [editorMode, edges, gridSizeMm, netLabelByEdgeId, visibleNodeIds]);

  const searchJlcParts = React.useCallback(async () => {
    if (!activeNode || activeNode.data.kind !== 'component') {
      return;
    }

    setJlcSearching(true);
    try {
      const params = new URLSearchParams({
        query: jlcQuery.trim(),
        footprint: activeNode.data.footprint,
        limit: '12',
      });
      const response = await fetch(`/api/jlc/search?${params.toString()}`);
      const payload = (await response.json()) as { parts?: JlcPart[] };
      setJlcResults(payload.parts ?? []);
      setStatus(`JLC search returned ${payload.parts?.length ?? 0} parts`);
    } catch {
      setStatus('JLC search failed');
    } finally {
      setJlcSearching(false);
    }
  }, [activeNode, jlcQuery]);

  const collisions = React.useMemo(() => {
    const components = nodes
      .filter((node) => node.data.kind === 'component')
      .map((node) => ({
        id: node.id,
        type: node.data.label,
        designator: node.data.label,
        footprint: node.data.footprint,
        position: node.position,
        rotation: node.data.rotation,
        layer: node.data.layer,
        pins: node.data.pins,
        bounds: node.data.bounds,
      }));

    return detectCollisions(components);
  }, [nodes]);

  const addComponent = React.useCallback(
    (libraryIndex: number) => {
      const id = `cmp_${crypto.randomUUID()}`;
      const component = createCatalogComponent(
        libraryIndex,
        id,
        designatorCount + 1,
        {
          x: 120,
          y: 120,
        }
      );

      setNodes((current) => [
        ...current,
        {
          id: component.id,
          type: 'pcbNode',
          position: component.position,
          data: {
            kind: 'component',
            label: component.designator,
            footprint: component.footprint,
            value: component.value,
            rotation: component.rotation,
            layer: component.layer,
            pins: component.pins,
            bounds: component.bounds,
          },
        },
      ]);
      setLayoutPositions((current) => ({
        ...current,
        [component.id]: { ...component.position },
      }));
      setSchematicPositions((current) => ({
        ...current,
        [component.id]: { ...component.position },
      }));
      setDesignatorCount((count) => count + 1);
    },
    [designatorCount, setNodes]
  );

  const inferDesignatorPrefix = React.useCallback((part: JlcPart) => {
    const token = `${part.category} ${part.description}`.toLowerCase();
    if (token.includes('resistor')) return 'R';
    if (token.includes('capacitor')) return 'C';
    if (token.includes('inductor')) return 'L';
    if (token.includes('connector') || token.includes('header')) return 'J';
    if (token.includes('diode') || token.includes('led')) return 'D';
    if (token.includes('transistor') || token.includes('mosfet')) return 'Q';
    if (
      token.includes('ic') ||
      token.includes('mcu') ||
      token.includes('driver') ||
      token.includes('regulator') ||
      token.includes('amplifier')
    ) {
      return 'U';
    }
    return 'U';
  }, []);

  const buildPinsForPart = React.useCallback((pinCount: number) => {
    const safeCount = Math.max(1, Math.min(128, pinCount));
    return Array.from({ length: safeCount }, (_, i) => ({
      id: String(i + 1),
      name: String(i + 1),
    }));
  }, []);

  const addCatalogPartNode = React.useCallback(
    (part: JlcPart, position: { x: number; y: number }) => {
      const index = designatorCount + 1;
      const prefix = inferDesignatorPrefix(part);
      const label = `${prefix}${index}`;
      const pinCount = Math.max(1, part.pinCount ?? 2);
      const bodySizeMm = part.bodySizeMm ?? { width: 2, height: 1.25 };
      const snapped = snapToGrid(position, gridSizeMm);

      const node: PcbFlowNode = {
        id: `cmp_${crypto.randomUUID()}`,
        type: 'pcbNode',
        position: snapped,
        data: {
          kind: 'component',
          label,
          footprint: part.package || 'Generic',
          value: part.manufacturerPartNumber,
          lcscPartNumber: part.lcscPartNumber,
          manufacturerPartNumber: part.manufacturerPartNumber,
          partDescription: part.description,
          rotation: 0,
          layer: 'top',
          pins: buildPinsForPart(pinCount),
          bounds: {
            width: Math.max(0.8, bodySizeMm.width),
            height: Math.max(0.6, bodySizeMm.height),
          },
        },
      };

      setNodes((current) => [...current, node]);
      setLayoutPositions((current) => ({
        ...current,
        [node.id]: { ...node.position },
      }));
      setSchematicPositions((current) => ({
        ...current,
        [node.id]: { ...node.position },
      }));
      setDesignatorCount(index);
      setStatus(
        `Placed ${part.manufacturerPartNumber} (${part.lcscPartNumber})`
      );
    },
    [
      buildPinsForPart,
      designatorCount,
      gridSizeMm,
      inferDesignatorPrefix,
      setNodes,
    ]
  );

  const searchCatalogParts = React.useCallback(async () => {
    const trimmed = catalogQuery.trim();
    if (!trimmed) {
      setCatalogResults([]);
      return;
    }

    setCatalogSearching(true);
    try {
      const params = new URLSearchParams({
        query: trimmed,
        limit: '30',
        source: 'remote',
      });

      const response = await fetch(`/api/jlc/search?${params.toString()}`);
      const payload = (await response.json()) as {
        parts?: JlcPart[];
        source?: 'local' | 'remote';
      };
      setCatalogResults(payload.parts ?? []);
      setStatus(
        `Catalog search: ${payload.parts?.length ?? 0} parts (${
          payload.source ?? 'local'
        })`
      );
    } catch {
      setStatus('Catalog search failed');
    } finally {
      setCatalogSearching(false);
    }
  }, [catalogQuery]);

  const onCatalogDragStart = React.useCallback(
    (event: React.DragEvent<HTMLButtonElement>, part: JlcPart) => {
      event.dataTransfer.setData(
        'application/x-modstract-part',
        JSON.stringify(part)
      );
      event.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  const onCanvasDragOver = React.useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('application/x-modstract-part')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onCanvasDrop = React.useCallback(
    (event: React.DragEvent) => {
      const raw = event.dataTransfer.getData('application/x-modstract-part');
      if (!raw) {
        return;
      }

      event.preventDefault();
      try {
        const part = JSON.parse(raw) as JlcPart;
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addCatalogPartNode(part, position);
      } catch {
        setStatus('Failed to drop part on canvas');
      }
    },
    [addCatalogPartNode, screenToFlowPosition]
  );

  const addModuleInstance = React.useCallback(
    (moduleId: string) => {
      const moduleDef = moduleLibrary[moduleId];
      if (!moduleDef) {
        return;
      }

      const id = `mod_${crypto.randomUUID()}`;
      setNodes((current) => [
        ...current,
        {
          id,
          type: 'pcbNode',
          position: { x: 220, y: 220 },
          data: {
            kind: 'moduleInstance',
            label: moduleDef.name,
            footprint: 'MODULE',
            value: moduleDef.name,
            rotation: 0,
            layer: 'top',
            moduleId: moduleDef.id,
            bounds: { width: 12, height: 8 },
            pins: moduleDef.exposedPins.map((pin) => ({
              id: pin.id,
              name: pin.name,
            })),
          },
        },
      ]);
      setLayoutPositions((current) => ({
        ...current,
        [id]: { x: 220, y: 220 },
      }));
      setSchematicPositions((current) => ({
        ...current,
        [id]: { x: 220, y: 220 },
      }));
    },
    [moduleLibrary, setNodes]
  );

  const addTextAnnotation = React.useCallback(() => {
    const text = 'TEXT';
    const sizeMm = 1.6;
    const id = `txt_${crypto.randomUUID()}`;
    const width = Math.max(8, text.length * sizeMm * 0.62);
    const height = Math.max(1.2, sizeMm * 1.2);

    const position = snapToGrid(
      { x: boardCenter.x, y: boardCenter.y },
      gridSizeMm
    );

    setNodes((current) => [
      ...current,
      {
        id,
        type: 'pcbNode',
        position,
        data: {
          kind: 'textAnnotation',
          annotationMode: editorMode,
          label: text,
          footprint: 'TEXT',
          textSizeMm: sizeMm,
          rotation: 0,
          layer: 'top',
          pins: [],
          bounds: { width, height },
        },
      },
    ]);
    setLayoutPositions((current) => ({
      ...current,
      [id]: { ...position },
    }));
    setSchematicPositions((current) => ({
      ...current,
      [id]: { ...position },
    }));
    setStatus('Added text annotation');
  }, [boardCenter.x, boardCenter.y, editorMode, gridSizeMm, setNodes]);

  const updateActiveNode = React.useCallback(
    (
      patch: Partial<EditorNodeData> & {
        positionX?: number;
        positionY?: number;
      }
    ) => {
      if (!activeNode) {
        return;
      }

      setNodes((current) =>
        current.map((node) => {
          if (node.id !== activeNode.id) {
            return node;
          }

          return {
            ...node,
            position: {
              x: patch.positionX ?? node.position.x,
              y: patch.positionY ?? node.position.y,
            },
            data: {
              ...node.data,
              ...patch,
            },
          };
        })
      );
    },
    [activeNode, setNodes]
  );

  const assignJlcPart = React.useCallback(
    (part: JlcPart) => {
      updateActiveNode({
        lcscPartNumber: part.lcscPartNumber,
        manufacturerPartNumber: part.manufacturerPartNumber,
        partDescription: part.description,
      });
      setStatus(
        `Assigned ${part.lcscPartNumber} to ${
          activeNode?.data.label ?? 'component'
        }`
      );
    },
    [activeNode, updateActiveNode]
  );

  const updateActiveEdge = React.useCallback(
    (patch: Partial<NonNullable<PcbFlowEdge['data']>>) => {
      if (!activeEdge) {
        return;
      }

      setEdges((current) =>
        current.map((edge) => {
          if (edge.id !== activeEdge.id) {
            return edge;
          }

          return {
            ...edge,
            data: {
              ...edge.data,
              ...patch,
            },
          };
        })
      );
    },
    [activeEdge, setEdges]
  );

  const addViaOnActiveEdgeAt = React.useCallback(
    (anchor: 'start' | 'middle' | 'end') => {
      if (!activeEdge || !activeEdge.sourceHandle || !activeEdge.targetHandle) {
        return;
      }

      const sourceNode = nodeById.get(activeEdge.source);
      const targetNode = nodeById.get(activeEdge.target);
      if (!sourceNode || !targetNode) {
        return;
      }

      const start = getPinAnchor(sourceNode, activeEdge.sourceHandle, 'right');
      const end = getPinAnchor(targetNode, activeEdge.targetHandle, 'left');
      const splitPoint = activeEdge.data?.waypoints?.[0] ?? {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };

      const point =
        anchor === 'start' ? start : anchor === 'end' ? end : splitPoint;
      const existing = activeEdge.data?.vias ?? [];
      updateActiveEdge({
        vias: [
          ...existing,
          {
            x: point.x,
            y: point.y,
            drillMm: 0.3,
            padMm: 0.6,
          },
        ],
      });
    },
    [activeEdge, getPinAnchor, nodeById, updateActiveEdge]
  );

  const addViaOnActiveEdge = React.useCallback(() => {
    addViaOnActiveEdgeAt('middle');
  }, [addViaOnActiveEdgeAt]);

  const fitBoardToComponents = React.useCallback(() => {
    const components = nodes.filter((node) => node.data.kind === 'component');
    if (components.length === 0) {
      setStatus('No components available to fit board outline');
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    components.forEach((node) => {
      const halfW = node.data.bounds.width / 2;
      const halfH = node.data.bounds.height / 2;
      minX = Math.min(minX, node.position.x - halfW);
      maxX = Math.max(maxX, node.position.x + halfW);
      minY = Math.min(minY, node.position.y - halfH);
      maxY = Math.max(maxY, node.position.y + halfH);
    });

    const width = Math.max(20, maxX - minX + boardFitMarginMm * 2);
    const height = Math.max(20, maxY - minY + boardFitMarginMm * 2);
    setBoardWidthMm(Math.round(width / gridSizeMm) * gridSizeMm);
    setBoardHeightMm(Math.round(height / gridSizeMm) * gridSizeMm);
    setBoardCenter(
      snapToGrid(
        {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        },
        gridSizeMm
      )
    );
    setStatus('Board reference fitted to components + margin');
  }, [boardFitMarginMm, gridSizeMm, nodes]);

  const onNodeDragStop = React.useCallback(
    (_event: unknown, node: PcbFlowNode) => {
      if (editorMode === 'layout') {
        const snapped = snapToGrid(node.position, gridSizeMm);
        setNodes((current) =>
          current.map((candidate) =>
            candidate.id === node.id
              ? {
                  ...candidate,
                  position: snapped,
                }
              : candidate
          )
        );
        setLayoutPositions((current) => ({
          ...current,
          [node.id]: snapped,
        }));
        return;
      }

      setSchematicPositions((current) => ({
        ...current,
        [node.id]: { x: node.position.x, y: node.position.y },
      }));
    },
    [editorMode, gridSizeMm, setNodes]
  );

  const saveDesign = React.useCallback(() => {
    const state: PersistedEditorState = {
      nodes,
      edges,
      moduleLibrary,
      designatorCount,
      schematicPositions,
      layoutPositions,
      boardCenter,
      boardWidthMm,
      boardHeightMm,
      boardFitMarginMm,
      gerberSilkStrokeMm,
      showBoardReference,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus('Design saved to local storage');
  }, [
    nodes,
    edges,
    moduleLibrary,
    designatorCount,
    schematicPositions,
    layoutPositions,
    boardCenter,
    boardWidthMm,
    boardHeightMm,
    boardFitMarginMm,
    gerberSilkStrokeMm,
    showBoardReference,
  ]);

  const buildProject = React.useCallback(() => {
    return buildProjectFromEditor(
      'project_local',
      'Modular PCB',
      nodes,
      edges,
      moduleLibrary,
      {
        width: boardWidthMm,
        height: boardHeightMm,
        origin: {
          x: boardCenter.x - boardWidthMm / 2,
          y: boardCenter.y - boardHeightMm / 2,
        },
        twoLayer: true,
      },
      gridSizeMm
    );
  }, [
    boardCenter.x,
    boardCenter.y,
    boardHeightMm,
    boardWidthMm,
    edges,
    gridSizeMm,
    moduleLibrary,
    nodes,
  ]);

  const exportGerber = React.useCallback(async () => {
    const project = buildProject();
    const flattened = flattenProject(project);

    const response = await fetch('/api/export/gerber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        flattened,
        options: {
          silkscreenStrokeMm: gerberSilkStrokeMm,
        },
      }),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as {
        detail?: string;
        error?: string;
      } | null;
      setStatus(
        `Gerber export failed: ${
          errorPayload?.detail ?? errorPayload?.error ?? response.statusText
        }`
      );
      return;
    }

    const blob = await response.blob();
    downloadBlob(blob, 'pcb_gerber.zip');
    setStatus('Gerber ZIP exported');
  }, [buildProject, gerberSilkStrokeMm]);

  const exportPnp = React.useCallback(async () => {
    const project = buildProject();
    const flattened = flattenProject(project);

    const response = await fetch('/api/export/pnp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, flattened }),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as {
        detail?: string;
        error?: string;
      } | null;
      setStatus(
        `Pick & Place export failed: ${
          errorPayload?.detail ?? errorPayload?.error ?? response.statusText
        }`
      );
      return;
    }

    const csv = await response.text();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'pcb_pick_and_place.csv');
    setStatus('Pick & Place CSV exported');
  }, [buildProject]);

  const exportBom = React.useCallback(async () => {
    const project = buildProject();
    const flattened = flattenProject(project);

    const response = await fetch('/api/export/bom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, flattened }),
    });

    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as {
        detail?: string;
        error?: string;
      } | null;
      setStatus(
        `BOM export failed: ${
          errorPayload?.detail ?? errorPayload?.error ?? response.statusText
        }`
      );
      return;
    }

    const csv = await response.text();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'pcb_bom.csv');
    setStatus('BOM CSV exported');
  }, [buildProject]);

  const convertSelectionToModule = React.useCallback(() => {
    const selected = nodes.filter(
      (node) =>
        selectedNodeIds.includes(node.id) && node.data.kind === 'component'
    );

    if (selected.length < 1) {
      setStatus('Select at least one component node to create module');
      return;
    }

    const selectedSet = new Set(selected.map((node) => node.id));
    const externalEdges = edges.filter(
      (edge) => selectedSet.has(edge.source) !== selectedSet.has(edge.target)
    );

    const { pinNetMap } = buildNets(nodes, edges);

    const center = selected.reduce(
      (acc, node) => ({
        x: acc.x + node.position.x,
        y: acc.y + node.position.y,
      }),
      { x: 0, y: 0 }
    );

    const centroid = {
      x: center.x / selected.length,
      y: center.y / selected.length,
    };

    const internalComponents = selected.map((node) => ({
      id: node.id,
      type: node.data.label,
      designator: node.data.label,
      footprint: node.data.footprint,
      value: node.data.value,
      lcscPartNumber: node.data.lcscPartNumber,
      manufacturerPartNumber: node.data.manufacturerPartNumber,
      partDescription: node.data.partDescription,
      position: {
        x: node.position.x - centroid.x,
        y: node.position.y - centroid.y,
      },
      rotation: node.data.rotation,
      layer: node.data.layer,
      bounds: node.data.bounds,
      pins: node.data.pins.map((pin) => ({
        ...pin,
        netId: pinNetMap.get(getPinToken(node.id, pin.id)),
      })),
    }));

    const netGroups = new Map<
      string,
      { componentId: string; pinId: string }[]
    >();
    internalComponents.forEach((component) => {
      component.pins.forEach((pin) => {
        if (!pin.netId) {
          return;
        }
        const existing = netGroups.get(pin.netId) ?? [];
        existing.push({ componentId: component.id, pinId: pin.id });
        netGroups.set(pin.netId, existing);
      });
    });

    const internalNets = Array.from(netGroups.entries()).map(
      ([id, connections]) => ({
        id,
        name: id,
        connections,
      })
    );

    const exposedByNet = new Map<
      string,
      { id: string; name: string; internalNetId: string }
    >();
    const remappedEdges: PcbFlowEdge[] = [];

    externalEdges.forEach((edge) => {
      const selectedIsSource = selectedSet.has(edge.source);
      const selectedNodeId = selectedIsSource ? edge.source : edge.target;
      const selectedPinId = selectedIsSource
        ? edge.sourceHandle
        : edge.targetHandle;
      const externalNodeId = selectedIsSource ? edge.target : edge.source;
      const externalPinId = selectedIsSource
        ? edge.targetHandle
        : edge.sourceHandle;

      if (!selectedPinId || !externalPinId) {
        return;
      }

      const internalNetId = pinNetMap.get(
        getPinToken(selectedNodeId, selectedPinId)
      );
      const parentNetId = pinNetMap.get(
        getPinToken(externalNodeId, externalPinId)
      );
      if (!internalNetId || !parentNetId) {
        return;
      }

      if (!exposedByNet.has(internalNetId)) {
        const index = exposedByNet.size + 1;
        exposedByNet.set(internalNetId, {
          id: `EXP_${index}`,
          name: `EXP_${index}`,
          internalNetId,
        });
      }

      const exposedPin = exposedByNet.get(internalNetId);
      if (!exposedPin) {
        return;
      }

      remappedEdges.push(
        selectedIsSource
          ? {
              id: `e_${crypto.randomUUID()}`,
              source: externalNodeId,
              sourceHandle: externalPinId,
              target: 'TEMP_MODULE',
              targetHandle: exposedPin.id,
              type: 'editableTrace',
              data: {
                traceWidthMm: 0.25,
                traceLayer: 'top',
                waypoints: [],
                vias: [],
              },
            }
          : {
              id: `e_${crypto.randomUUID()}`,
              source: 'TEMP_MODULE',
              sourceHandle: exposedPin.id,
              target: externalNodeId,
              targetHandle: externalPinId,
              type: 'editableTrace',
              data: {
                traceWidthMm: 0.25,
                traceLayer: 'top',
                waypoints: [],
                vias: [],
              },
            }
      );
    });

    const moduleId = `lib_${crypto.randomUUID()}`;
    const moduleName = `Module_${Object.keys(moduleLibrary).length + 1}`;
    const moduleDef: Module = {
      id: moduleId,
      name: moduleName,
      components: internalComponents,
      nets: internalNets,
      submodules: [],
      exposedPins: Array.from(exposedByNet.values()),
    };

    setModuleLibrary((current) => ({
      ...current,
      [moduleId]: moduleDef,
    }));

    const instanceId = `mod_${crypto.randomUUID()}`;
    const instanceNode: PcbFlowNode = {
      id: instanceId,
      type: 'pcbNode',
      position: centroid,
      data: {
        kind: 'moduleInstance',
        label: moduleName,
        footprint: 'MODULE',
        rotation: 0,
        layer: 'top',
        moduleId,
        value: moduleName,
        bounds: { width: 16, height: 8 },
        pins: moduleDef.exposedPins.map((pin) => ({
          id: pin.id,
          name: pin.name,
        })),
      },
    };

    const idsToRemove = new Set(selected.map((node) => node.id));
    setNodes((current) => [
      ...current.filter((node) => !idsToRemove.has(node.id)),
      instanceNode,
    ]);
    setLayoutPositions((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => !idsToRemove.has(id))
      );
      next[instanceId] = { ...centroid };
      return next;
    });
    setSchematicPositions((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => !idsToRemove.has(id))
      );
      next[instanceId] = { ...centroid };
      return next;
    });

    setEdges((current) => {
      const kept = current.filter(
        (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target)
      );
      const remapped = remappedEdges.map((edge) => ({
        ...edge,
        source: edge.source === 'TEMP_MODULE' ? instanceId : edge.source,
        target: edge.target === 'TEMP_MODULE' ? instanceId : edge.target,
      }));

      return [...kept, ...remapped];
    });

    setSelectedNodeIds([instanceId]);
    setActiveNodeId(instanceId);
    setStatus(`Created reusable module: ${moduleName}`);
  }, [nodes, edges, selectedNodeIds, moduleLibrary, setNodes, setEdges]);

  return (
    <div className='flex min-h-screen flex-col bg-slate-100'>
      <header className='flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3'>
        <div>
          <h1 className='text-lg font-semibold'>Modular PCB Creator</h1>
          <p className='text-xs text-slate-600'>
            Graph abstraction with recursive modules and fabrication exports
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <div className='mr-2 flex items-center rounded border border-slate-300 p-1 text-xs'>
            <button
              className={`rounded px-2 py-1 ${
                editorMode === 'schematic'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-700'
              }`}
              onClick={() => setEditorMode('schematic')}
            >
              Schematic
            </button>
            <button
              className={`rounded px-2 py-1 ${
                editorMode === 'layout'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-700'
              }`}
              onClick={() => setEditorMode('layout')}
            >
              Layout
            </button>
          </div>
          <button
            className='rounded bg-slate-800 px-3 py-1.5 text-sm text-white'
            onClick={saveDesign}
          >
            Save
          </button>
          <button
            className='rounded bg-emerald-700 px-3 py-1.5 text-sm text-white'
            onClick={convertSelectionToModule}
          >
            Convert Selection to Module
          </button>
          <button
            className='rounded bg-blue-700 px-3 py-1.5 text-sm text-white'
            onClick={exportGerber}
          >
            Export Gerber ZIP
          </button>
          <button
            className='rounded bg-indigo-700 px-3 py-1.5 text-sm text-white'
            onClick={exportPnp}
          >
            Export Pick & Place
          </button>
          <button
            className='rounded bg-amber-700 px-3 py-1.5 text-sm text-white'
            onClick={exportBom}
          >
            Export BOM
          </button>
        </div>
      </header>

      <div className='grid flex-1 grid-cols-[260px_1fr_280px] overflow-hidden'>
        <aside className='overflow-y-auto border-r border-slate-300 bg-white p-3'>
          <h2 className='mb-2 text-sm font-semibold'>Component Library</h2>
          <div className='space-y-2'>
            {COMPONENT_LIBRARY.map((entry, index) => (
              <button
                key={entry.type + entry.footprint}
                className='w-full rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-slate-500'
                onClick={() => addComponent(index)}
              >
                <p className='font-medium'>{entry.type}</p>
                <p className='text-xs text-slate-600'>{entry.footprint}</p>
              </button>
            ))}
          </div>

          <h2 className='mb-2 mt-5 text-sm font-semibold'>Modules</h2>
          <div className='space-y-2'>
            {Object.values(moduleLibrary).length === 0 ? (
              <p className='text-xs text-slate-500'>No reusable modules yet</p>
            ) : (
              Object.values(moduleLibrary).map((module) => (
                <button
                  key={module.id}
                  className='w-full rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-slate-500'
                  onClick={() => addModuleInstance(module.id)}
                >
                  <p className='font-medium'>{module.name}</p>
                  <p className='text-xs text-slate-600'>
                    {module.exposedPins.length} exposed pins
                  </p>
                </button>
              ))
            )}
          </div>

          <h2 className='mb-2 mt-5 text-sm font-semibold'>Text</h2>
          <button
            className='mb-1 w-full rounded border border-slate-300 px-3 py-2 text-left text-sm hover:border-slate-500'
            onClick={addTextAnnotation}
          >
            Add Layout Text
          </button>

          <h2 className='mb-2 mt-5 text-sm font-semibold'>
            Real Parts Catalog
          </h2>
          <div className='space-y-2 rounded border border-slate-300 bg-slate-50 p-2'>
            <div className='flex gap-1'>
              <input
                className='w-full rounded border border-slate-300 px-2 py-1 text-xs'
                value={catalogQuery}
                placeholder='Search LCSC/MPN/package'
                onChange={(event) => setCatalogQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void searchCatalogParts();
                  }
                }}
              />
              <button
                className='rounded bg-slate-800 px-2 py-1 text-xs text-white'
                onClick={searchCatalogParts}
                disabled={catalogSearching}
              >
                {catalogSearching ? '...' : 'Find'}
              </button>
            </div>
            <p className='text-[11px] text-slate-600'>
              Drag result cards into canvas to place parts.
            </p>
            <div className='max-h-64 space-y-1 overflow-y-auto'>
              {catalogResults.map((part) => (
                <button
                  key={`${part.lcscPartNumber}-${part.manufacturerPartNumber}`}
                  draggable
                  onDragStart={(event) => onCatalogDragStart(event, part)}
                  onDoubleClick={() =>
                    addCatalogPartNode(part, { x: 180, y: 180 })
                  }
                  className='w-full cursor-grab rounded border border-slate-300 bg-white px-2 py-1 text-left text-xs active:cursor-grabbing hover:border-slate-500'
                >
                  <p className='font-medium'>
                    {part.lcscPartNumber} · {part.manufacturerPartNumber}
                  </p>
                  <p className='text-slate-600'>
                    {part.package} · {part.pinCount ?? 2} pins ·{' '}
                    {part.bodySizeMm
                      ? `${part.bodySizeMm.width}x${part.bodySizeMm.height}mm`
                      : 'auto size'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className='h-full min-h-0'>
          <ReactFlow
            nodes={visibleNodes}
            edges={renderedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodeDragStop}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.05}
            maxZoom={40}
            fitView
          >
            <Background
              gap={editorMode === 'schematic' ? 28 : 20}
              size={editorMode === 'schematic' ? 1.2 : 1}
              color={editorMode === 'schematic' ? '#c7d2fe' : '#d0d7e2'}
            />
            <MiniMap
              nodeColor={(node) => {
                if (node.data.kind !== 'component') {
                  return '#64748b';
                }
                return node.data.layer === 'top' ? '#dc2626' : '#2563eb';
              }}
            />
            <Controls />
            {editorMode === 'layout' && showBoardReference && (
              <ViewportPortal>
                <div
                  className='pointer-events-none absolute border-2 border-dashed border-emerald-600/70 bg-emerald-100/20'
                  style={{
                    left:
                      boardCenter.x -
                      (boardWidthMm * layoutMmToCanvas * layoutVisualScale) / 2,
                    top:
                      boardCenter.y -
                      (boardHeightMm * layoutMmToCanvas * layoutVisualScale) /
                        2,
                    width: boardWidthMm * layoutMmToCanvas * layoutVisualScale,
                    height:
                      boardHeightMm * layoutMmToCanvas * layoutVisualScale,
                  }}
                />
              </ViewportPortal>
            )}
            {editorMode === 'layout' && (
              <Panel position='top-left'>
                <div className='rounded border border-emerald-300 bg-emerald-50/90 px-2 py-1 text-[11px] text-emerald-900'>
                  Board Ref: {boardWidthMm} x {boardHeightMm} mm
                </div>
              </Panel>
            )}
          </ReactFlow>
        </main>

        <aside className='overflow-y-auto border-l border-slate-300 bg-white p-3'>
          <h2 className='mb-2 text-sm font-semibold'>Properties</h2>
          {!activeNode ? (
            !activeEdge ? (
              <p className='text-xs text-slate-500'>
                Select a node or trace to edit properties
              </p>
            ) : (
              <div className='space-y-2 text-sm'>
                <p className='text-xs font-semibold text-slate-700'>Trace</p>
                <label className='block'>
                  <span className='mb-1 block text-xs text-slate-600'>
                    Width (mm)
                  </span>
                  <input
                    type='number'
                    min={0.1}
                    step={0.05}
                    className='w-full rounded border border-slate-300 px-2 py-1'
                    value={activeEdge.data?.traceWidthMm ?? 0.25}
                    onChange={(event) =>
                      updateActiveEdge({
                        traceWidthMm: Math.max(0.1, Number(event.target.value)),
                      })
                    }
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs text-slate-600'>
                    Layer
                  </span>
                  <select
                    className='w-full rounded border border-slate-300 px-2 py-1'
                    value={activeEdge.data?.traceLayer ?? 'top'}
                    onChange={(event) =>
                      updateActiveEdge({
                        traceLayer:
                          event.target.value === 'bottom' ? 'bottom' : 'top',
                      })
                    }
                  >
                    <option value='top'>Top</option>
                    <option value='bottom'>Bottom</option>
                  </select>
                </label>
                <button
                  className='rounded bg-slate-800 px-2 py-1 text-xs text-white'
                  onClick={addViaOnActiveEdge}
                >
                  Add Via
                </button>
                <div className='flex gap-1'>
                  <button
                    className='rounded border border-slate-300 px-2 py-1 text-xs'
                    onClick={() => addViaOnActiveEdgeAt('start')}
                  >
                    Via @ Start Dot
                  </button>
                  <button
                    className='rounded border border-slate-300 px-2 py-1 text-xs'
                    onClick={() => addViaOnActiveEdgeAt('middle')}
                  >
                    Via @ Midpoint
                  </button>
                  <button
                    className='rounded border border-slate-300 px-2 py-1 text-xs'
                    onClick={() => addViaOnActiveEdgeAt('end')}
                  >
                    Via @ End Dot
                  </button>
                </div>
                <p className='text-xs text-slate-600'>
                  Vias: {activeEdge.data?.vias?.length ?? 0}
                </p>
              </div>
            )
          ) : (
            <div className='space-y-2 text-sm'>
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>Label</span>
                <input
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.data.label}
                  onChange={(event) => {
                    const nextLabel = event.target.value;
                    const textSizeMm = activeNode.data.textSizeMm ?? 1.6;

                    updateActiveNode({
                      label: nextLabel,
                      ...(activeNode.data.kind === 'textAnnotation'
                        ? {
                            bounds: {
                              width: Math.max(
                                8,
                                nextLabel.length * textSizeMm * 0.62
                              ),
                              height: Math.max(1.2, textSizeMm * 1.2),
                            },
                          }
                        : {}),
                    });
                  }}
                />
              </label>
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>
                  Footprint
                </span>
                <input
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.data.footprint}
                  onChange={(event) =>
                    updateActiveNode({ footprint: event.target.value })
                  }
                  disabled={activeNode.data.kind === 'textAnnotation'}
                />
              </label>
              {activeNode.data.kind === 'textAnnotation' && (
                <label className='block'>
                  <span className='mb-1 block text-xs text-slate-600'>
                    Text Height (mm)
                  </span>
                  <input
                    type='number'
                    min={0.8}
                    step={0.1}
                    className='w-full rounded border border-slate-300 px-2 py-1'
                    value={activeNode.data.textSizeMm ?? 1.6}
                    onChange={(event) => {
                      const nextSize = Math.max(
                        0.8,
                        Number(event.target.value)
                      );
                      const nextLabel = activeNode.data.label || 'TEXT';

                      updateActiveNode({
                        textSizeMm: nextSize,
                        bounds: {
                          width: Math.max(
                            8,
                            nextLabel.length * nextSize * 0.62
                          ),
                          height: Math.max(1.2, nextSize * 1.2),
                        },
                      });
                    }}
                  />
                </label>
              )}
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>
                  Position X (mm)
                </span>
                <input
                  type='number'
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.position.x}
                  onChange={(event) =>
                    updateActiveNode({ positionX: Number(event.target.value) })
                  }
                />
              </label>
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>
                  Position Y (mm)
                </span>
                <input
                  type='number'
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.position.y}
                  onChange={(event) =>
                    updateActiveNode({ positionY: Number(event.target.value) })
                  }
                />
              </label>
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>
                  Rotation (deg)
                </span>
                <input
                  type='number'
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.data.rotation}
                  onChange={(event) =>
                    updateActiveNode({ rotation: Number(event.target.value) })
                  }
                />
              </label>
              <label className='block'>
                <span className='mb-1 block text-xs text-slate-600'>Layer</span>
                <select
                  className='w-full rounded border border-slate-300 px-2 py-1'
                  value={activeNode.data.layer}
                  onChange={(event) =>
                    updateActiveNode({
                      layer: event.target.value === 'bottom' ? 'bottom' : 'top',
                    })
                  }
                >
                  <option value='top'>Top</option>
                  <option value='bottom'>Bottom</option>
                </select>
              </label>

              {activeNode.data.kind === 'component' && (
                <div className='rounded border border-slate-300 bg-slate-50 p-2'>
                  <p className='mb-2 text-xs font-semibold text-slate-700'>
                    JLC Part Search
                  </p>
                  <div className='flex gap-1'>
                    <input
                      className='w-full rounded border border-slate-300 px-2 py-1 text-xs'
                      value={jlcQuery}
                      placeholder='Search MPN / LCSC / description'
                      onChange={(event) => setJlcQuery(event.target.value)}
                    />
                    <button
                      className='rounded bg-slate-800 px-2 py-1 text-xs text-white'
                      onClick={searchJlcParts}
                      disabled={jlcSearching}
                    >
                      {jlcSearching ? '...' : 'Find'}
                    </button>
                  </div>
                  <div className='mt-2 space-y-1'>
                    {jlcResults.map((part) => (
                      <button
                        key={part.lcscPartNumber}
                        className='w-full rounded border border-slate-300 px-2 py-1 text-left text-xs hover:border-slate-500'
                        onClick={() => assignJlcPart(part)}
                      >
                        <p className='font-medium'>
                          {part.lcscPartNumber} · {part.manufacturerPartNumber}
                        </p>
                        <p className='text-slate-600'>{part.description}</p>
                      </button>
                    ))}
                  </div>
                  <p className='mt-2 text-xs text-slate-600'>
                    Selected: {activeNode.data.lcscPartNumber ?? 'None'}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className='mt-6 rounded border border-slate-300 bg-slate-50 p-2'>
            <p className='mb-1 text-xs font-semibold text-slate-700'>Mode</p>
            <p className='text-xs text-slate-600'>
              {editorMode === 'schematic'
                ? 'Schematic mode emphasizes logical net connectivity.'
                : 'Layout mode emphasizes physical placement and layer routing.'}
            </p>
          </div>

          {editorMode === 'layout' && (
            <div className='mt-6 rounded border border-slate-300 bg-slate-50 p-2'>
              <p className='mb-1 text-xs font-semibold text-slate-700'>
                Layer Visibility
              </p>
              <label className='mb-1 flex items-center gap-2 text-xs text-slate-700'>
                <input
                  type='checkbox'
                  checked={showTopLayer}
                  onChange={(event) => setShowTopLayer(event.target.checked)}
                />
                Top Layer (Red)
              </label>
              <label className='flex items-center gap-2 text-xs text-slate-700'>
                <input
                  type='checkbox'
                  checked={showBottomLayer}
                  onChange={(event) => setShowBottomLayer(event.target.checked)}
                />
                Bottom Layer (Blue)
              </label>

              <p className='mb-1 mt-3 text-xs font-semibold text-slate-700'>
                Board Reference
              </p>
              <label className='mb-2 flex items-center gap-2 text-xs text-slate-700'>
                <input
                  type='checkbox'
                  checked={showBoardReference}
                  onChange={(event) =>
                    setShowBoardReference(event.target.checked)
                  }
                />
                Show board outline
              </label>
              <label className='mb-1 block text-xs text-slate-600'>
                Width (mm)
              </label>
              <input
                type='number'
                className='mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                min={20}
                step={1}
                value={boardWidthMm}
                onChange={(event) =>
                  setBoardWidthMm(Math.max(20, Number(event.target.value)))
                }
              />
              <label className='mb-1 block text-xs text-slate-600'>
                Height (mm)
              </label>
              <input
                type='number'
                className='mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                min={20}
                step={1}
                value={boardHeightMm}
                onChange={(event) =>
                  setBoardHeightMm(Math.max(20, Number(event.target.value)))
                }
              />
              <label className='mb-1 block text-xs text-slate-600'>
                Center X (mm)
              </label>
              <input
                type='number'
                className='mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                value={boardCenter.x}
                onChange={(event) =>
                  setBoardCenter((current) => ({
                    ...current,
                    x: Number(event.target.value),
                  }))
                }
              />
              <label className='mb-1 block text-xs text-slate-600'>
                Center Y (mm)
              </label>
              <input
                type='number'
                className='mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                value={boardCenter.y}
                onChange={(event) =>
                  setBoardCenter((current) => ({
                    ...current,
                    y: Number(event.target.value),
                  }))
                }
              />
              <label className='mb-1 block text-xs text-slate-600'>
                Fit Margin (mm)
              </label>
              <input
                type='number'
                className='mb-2 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                min={0}
                step={1}
                value={boardFitMarginMm}
                onChange={(event) =>
                  setBoardFitMarginMm(Math.max(0, Number(event.target.value)))
                }
              />
              <button
                className='w-full rounded border border-slate-300 px-2 py-1 text-xs hover:border-slate-500'
                onClick={fitBoardToComponents}
              >
                Fit to Components + Margin
              </button>

              <p className='mb-1 mt-3 text-xs font-semibold text-slate-700'>
                Gerber Export
              </p>
              <label className='mb-1 block text-xs text-slate-600'>
                Silkscreen Text Stroke (mm)
              </label>
              <input
                type='number'
                className='mb-1 w-full rounded border border-slate-300 px-2 py-1 text-sm'
                min={0.04}
                max={0.2}
                step={0.01}
                value={gerberSilkStrokeMm}
                onChange={(event) =>
                  setGerberSilkStrokeMm(
                    Math.min(0.2, Math.max(0.04, Number(event.target.value)))
                  )
                }
              />
              <p className='text-[11px] text-slate-600'>
                Used for Gerber text thickness on top and bottom silkscreen.
              </p>

              <label className='mb-1 mt-3 block text-xs text-slate-600'>
                Layout View Zoom
              </label>
              <input
                type='range'
                className='w-full'
                min={1}
                max={20}
                step={0.5}
                value={layoutViewZoom}
                onChange={(event) =>
                  setLayoutViewZoom(Number(event.target.value))
                }
              />
              <p className='text-[11px] text-slate-600'>
                Visual zoom only. Physical/export scale remains 1:1.
              </p>
            </div>
          )}

          <div className='mt-6 rounded border border-slate-300 bg-slate-50 p-2'>
            <p className='text-xs text-slate-700'>Grid snap (mm)</p>
            <input
              type='number'
              className='mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm'
              value={gridSizeMm}
              min={1}
              step={1}
              onChange={(event) =>
                setGridSizeMm(Math.max(1, Number(event.target.value)))
              }
            />
          </div>

          <div className='mt-6 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900'>
            <p className='font-semibold'>DRC Snapshot</p>
            <p>{collisions.length} component overlaps detected</p>
          </div>

          <div className='mt-6 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700'>
            <p className='font-semibold'>Net Summary</p>
            <p>{derivedNets.length} connected nets</p>
            <p>{renderedEdges.length} visible connections</p>
          </div>

          <div className='mt-6 rounded border border-slate-300 bg-slate-50 p-2 text-xs text-slate-700'>
            {status}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function EditorApp() {
  return (
    <ReactFlowProvider>
      <EditorShell />
    </ReactFlowProvider>
  );
}
