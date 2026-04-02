import { Edge } from '@xyflow/react';

import { PcbFlowEdge, PcbFlowNode } from '@/editor/types';

import {
  Module,
  ModuleInstance,
  Net,
  NetConnection,
  PcbProject,
  PcbText,
  Pin,
  Position,
  Trace,
} from '@/types/pcb';

type PinRef = {
  nodeId: string;
  pinId: string;
};

class UnionFind {
  private parent = new Map<string, string>();

  makeSet(item: string) {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
    }
  }

  find(item: string): string {
    const currentParent = this.parent.get(item);
    if (!currentParent) {
      this.parent.set(item, item);
      return item;
    }

    if (currentParent === item) {
      return item;
    }

    const root = this.find(currentParent);
    this.parent.set(item, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

function pinToken(nodeId: string, pinId: string) {
  return `${nodeId}:${pinId}`;
}

type PadSide = 'left' | 'right' | 'top' | 'bottom';

type PadAnchor = {
  id: string;
  side: PadSide;
  x: number;
  y: number;
};

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
  pins: Pin[],
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

function parsePinToken(token: string): PinRef {
  const [nodeId, pinId] = token.split(':');
  return { nodeId, pinId };
}

export function buildNets(nodes: PcbFlowNode[], edges: Edge[]) {
  const uf = new UnionFind();
  const tokens: string[] = [];

  nodes.forEach((node) => {
    node.data.pins.forEach((pin) => {
      const token = pinToken(node.id, pin.id);
      tokens.push(token);
      uf.makeSet(token);
    });
  });

  edges.forEach((edge) => {
    if (!edge.sourceHandle || !edge.targetHandle) {
      return;
    }

    const source = pinToken(edge.source, edge.sourceHandle);
    const target = pinToken(edge.target, edge.targetHandle);

    uf.makeSet(source);
    uf.makeSet(target);
    uf.union(source, target);
  });

  const groups = new Map<string, string[]>();
  tokens.forEach((token) => {
    const root = uf.find(token);
    const existing = groups.get(root) ?? [];
    existing.push(token);
    groups.set(root, existing);
  });

  let index = 1;
  const pinNetMap = new Map<string, string>();
  const nets: Net[] = [];

  groups.forEach((group) => {
    if (group.length < 2) {
      return;
    }

    const netId = `NET_${String(index).padStart(3, '0')}`;
    index += 1;

    const connections: NetConnection[] = group.map((token) => {
      pinNetMap.set(token, netId);
      const { nodeId, pinId } = parsePinToken(token);
      return {
        componentId: nodeId,
        pinId,
      };
    });

    nets.push({
      id: netId,
      name: netId,
      connections,
    });
  });

  return { nets, pinNetMap };
}

function getPinAnchor(
  node: PcbFlowNode,
  pinId: string,
  rendered = false
): Position {
  const visualScale = rendered
    ? Math.max(1, node.data.layoutVisualScale ?? 1)
    : 1;
  const bodyWidth = Math.max(0.1, node.data.bounds.width * visualScale);
  const bodyHeight = Math.max(0.1, node.data.bounds.height * visualScale);
  const anchors = createPadAnchors(node.data.pins, bodyWidth, bodyHeight);
  const anchor = anchors.find((item) => item.id === pinId);

  if (!anchor) {
    return { x: node.position.x, y: node.position.y };
  }

  return {
    x: node.position.x + (anchor.x - bodyWidth / 2),
    y: node.position.y + (anchor.y - bodyHeight / 2),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function traceFromEdge(
  edge: PcbFlowEdge,
  nodesById: Map<string, PcbFlowNode>,
  pinNetMap: Map<string, string>
): Trace | null {
  if (!edge.sourceHandle || !edge.targetHandle) {
    return null;
  }

  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (!sourceNode || !targetNode) {
    return null;
  }

  const start = getPinAnchor(sourceNode, edge.sourceHandle, false);
  const end = getPinAnchor(targetNode, edge.targetHandle, false);
  const startRendered = getPinAnchor(sourceNode, edge.sourceHandle, true);
  const endRendered = getPinAnchor(targetNode, edge.targetHandle, true);

  const startDelta = {
    x: startRendered.x - start.x,
    y: startRendered.y - start.y,
  };
  const endDelta = {
    x: endRendered.x - end.x,
    y: endRendered.y - end.y,
  };

  const storedWaypoints = edge.data?.waypoints ?? [];
  const waypoints = storedWaypoints.map((point, index) => {
    const t = (index + 1) / (storedWaypoints.length + 1);
    const dx = lerp(startDelta.x, endDelta.x, t);
    const dy = lerp(startDelta.y, endDelta.y, t);
    return {
      x: point.x - dx,
      y: point.y - dy,
    };
  });

  const viaDelta = {
    x: (startDelta.x + endDelta.x) / 2,
    y: (startDelta.y + endDelta.y) / 2,
  };

  const vias = (edge.data?.vias ?? []).map((via) => ({
    ...via,
    x: via.x - viaDelta.x,
    y: via.y - viaDelta.y,
  }));

  const rawPoints: Position[] = [start, ...(edge.data?.waypoints ?? []), end];
  const encodedPoints: Position[] = [start, ...waypoints, end];
  const points = rawPoints.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const prev = rawPoints[index - 1];
    return prev.x !== point.x || prev.y !== point.y;
  });

  const normalizedPoints = encodedPoints.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const prev = encodedPoints[index - 1];
    return prev.x !== point.x || prev.y !== point.y;
  });

  const sourceNetId = pinNetMap.get(pinToken(edge.source, edge.sourceHandle));
  const targetNetId = pinNetMap.get(pinToken(edge.target, edge.targetHandle));
  const netId = sourceNetId ?? targetNetId;

  return {
    id: edge.id,
    netId,
    layer: edge.data?.traceLayer ?? sourceNode.data.layer,
    widthMm: edge.data?.traceWidthMm ?? 0.25,
    points: points.length > 1 ? normalizedPoints : [start, end],
    vias,
  };
}

function assignPins(
  pins: Pin[],
  nodeId: string,
  pinNetMap: Map<string, string>
) {
  return pins.map((pin) => ({
    ...pin,
    netId: pinNetMap.get(pinToken(nodeId, pin.id)),
  }));
}

export function buildProjectFromEditor(
  projectId: string,
  projectName: string,
  nodes: PcbFlowNode[],
  edges: PcbFlowEdge[],
  moduleLibrary: Record<string, Module>,
  board: PcbProject['board'],
  gridSizeMm: number
): PcbProject {
  const { nets, pinNetMap } = buildNets(nodes, edges);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const components = nodes
    .filter((node) => node.data.kind === 'component')
    .map((node) => ({
      id: node.id,
      type: node.data.label,
      designator: node.data.label,
      footprint: node.data.footprint,
      value: node.data.value,
      lcscPartNumber: node.data.lcscPartNumber,
      manufacturerPartNumber: node.data.manufacturerPartNumber,
      partDescription: node.data.partDescription,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      rotation: node.data.rotation,
      layer: node.data.layer,
      pins: assignPins(node.data.pins, node.id, pinNetMap),
      bounds: node.data.bounds,
    }));

  const submodules: ModuleInstance[] = nodes
    .filter((node) => node.data.kind === 'moduleInstance' && node.data.moduleId)
    .map((node) => {
      const pinMap: Record<string, string> = {};
      node.data.pins.forEach((pin) => {
        const netId = pinNetMap.get(pinToken(node.id, pin.id));
        if (netId) {
          pinMap[pin.id] = netId;
        }
      });

      return {
        id: node.id,
        moduleId: node.data.moduleId as string,
        name: node.data.label,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        rotation: node.data.rotation,
        layer: node.data.layer,
        pinMap,
      };
    });

  const traces = edges
    .map((edge) => traceFromEdge(edge, nodesById, pinNetMap))
    .filter((trace): trace is Trace => trace !== null);

  const texts: PcbText[] = nodes
    .filter(
      (node) =>
        node.data.kind === 'textAnnotation' &&
        (node.data.annotationMode ?? 'layout') === 'layout'
    )
    .map((node) => ({
      id: node.id,
      text: node.data.label,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      sizeMm: Math.max(0.8, node.data.textSizeMm ?? 1.6),
      rotation: node.data.rotation,
      layer: node.data.layer,
    }));

  return {
    id: projectId,
    name: projectName,
    traces,
    texts,
    moduleLibrary,
    gridSizeMm,
    board,
    rootModule: {
      id: 'root',
      name: 'Root',
      components,
      nets,
      submodules,
      exposedPins: [],
    },
  };
}
