import { Edge } from '@xyflow/react';

import { PcbFlowEdge, PcbFlowNode } from '@/editor/types';

import {
  Module,
  ModuleInstance,
  Net,
  NetConnection,
  PcbProject,
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
  side: 'left' | 'right'
): Position {
  const pinIndex = node.data.pins.findIndex((pin) => pin.id === pinId);
  const normalizedIndex =
    pinIndex < 0 ? 0.5 : (pinIndex + 1) / (node.data.pins.length + 1);
  const xOffset =
    side === 'left' ? -node.data.bounds.width / 2 : node.data.bounds.width / 2;
  const yOffset = (normalizedIndex - 0.5) * node.data.bounds.height;

  return {
    x: node.position.x + xOffset,
    y: node.position.y + yOffset,
  };
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

  const start = getPinAnchor(sourceNode, edge.sourceHandle, 'right');
  const end = getPinAnchor(targetNode, edge.targetHandle, 'left');
  const rawPoints: Position[] = [start, ...(edge.data?.waypoints ?? []), end];
  const points = rawPoints.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const prev = rawPoints[index - 1];
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
    points,
    vias: edge.data?.vias ?? [],
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

  return {
    id: projectId,
    name: projectName,
    traces,
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
