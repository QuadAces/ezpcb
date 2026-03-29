'use client';

import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { DragEvent, useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Edge,
  EdgeChange,
  IsValidConnection,
  MiniMap,
  Node,
  NodeChange,
  NodeMouseHandler,
  Position,
  ReactFlowInstance,
} from 'reactflow';

import 'reactflow/dist/style.css';

import BuckConverter from './BuckConverter';
import ESP32 from './ESP32';
import Ground from './Ground';
import Pinout from './Pinout';
import RFIDModule from './RFIDModule';
import VoltageOutput from './VoltageOutput';

const nodeTypes = {
  rfid: RFIDModule,
  buck: BuckConverter,
  esp32: ESP32,
  ground: Ground,
  pinout: Pinout,
  voltageOutput: VoltageOutput,
};

type NodeTypeKey = keyof typeof nodeTypes;

type NodeConfig = Record<string, string>;

type PinType = 'voltage-in' | 'voltage-out' | 'gpio' | 'gnd';

type NumericRange = {
  min: number;
  max: number;
};

type ValidationResult = {
  kind: 'valid' | 'warning' | 'invalid';
  reason?: string;
};

type NodeFieldDefinition = {
  key: string;
  label: string;
  placeholder: string;
  inputType?: 'number' | 'text' | 'select';
  options?: string[];
};

const nodeFieldDefinitions: Record<NodeTypeKey, NodeFieldDefinition[]> = {
  voltageOutput: [
    {
      key: 'supplyInputType',
      label: 'Supply Input Type',
      placeholder: 'USB-C',
      inputType: 'select',
      options: ['USB-C', 'Barrel Jack'],
    },
    {
      key: 'outputVoltageMin',
      label: 'Output Voltage Min (V)',
      placeholder: 'e.g. 4.8',
      inputType: 'number',
    },
    {
      key: 'outputVoltageMax',
      label: 'Output Voltage Max (V)',
      placeholder: 'e.g. 5.2',
      inputType: 'number',
    },
    {
      key: 'maxCurrent',
      label: 'Max Current (A)',
      placeholder: 'e.g. 2.0',
      inputType: 'number',
    },
    {
      key: 'ripple',
      label: 'Ripple (mV)',
      placeholder: 'e.g. 50',
      inputType: 'number',
    },
  ],
  buck: [
    {
      key: 'inputVoltageMin',
      label: 'Input Voltage Min (V)',
      placeholder: 'e.g. 10',
      inputType: 'number',
    },
    {
      key: 'inputVoltageMax',
      label: 'Input Voltage Max (V)',
      placeholder: 'e.g. 14',
      inputType: 'number',
    },
    {
      key: 'outputVoltageMin',
      label: 'Output Voltage Min (V)',
      placeholder: 'e.g. 3.2',
      inputType: 'number',
    },
    {
      key: 'outputVoltageMax',
      label: 'Output Voltage Max (V)',
      placeholder: 'e.g. 3.4',
      inputType: 'number',
    },
    {
      key: 'maxCurrent',
      label: 'Max Current (A)',
      placeholder: 'e.g. 1.5',
      inputType: 'number',
    },
    {
      key: 'efficiency',
      label: 'Efficiency (%)',
      placeholder: 'e.g. 92',
      inputType: 'number',
    },
  ],
  rfid: [
    {
      key: 'supplyVoltageMin',
      label: 'Supply Voltage Min (V)',
      placeholder: 'e.g. 3.0',
      inputType: 'number',
    },
    {
      key: 'supplyVoltageMax',
      label: 'Supply Voltage Max (V)',
      placeholder: 'e.g. 3.6',
      inputType: 'number',
    },
    {
      key: 'frequency',
      label: 'Frequency (MHz)',
      placeholder: 'e.g. 13.56',
      inputType: 'number',
    },
    {
      key: 'protocol',
      label: 'Protocol',
      placeholder: 'e.g. ISO14443A',
      inputType: 'text',
    },
    {
      key: 'outputLogicWidth',
      label: 'Output Logic Width (bits)',
      placeholder: 'e.g. 1',
      inputType: 'number',
    },
  ],
  pinout: [
    {
      key: 'pinCount',
      label: 'Number of Pins',
      placeholder: 'e.g. 8',
      inputType: 'number',
    },
    {
      key: 'inputLogicWidth',
      label: 'Input Logic Width (bits)',
      placeholder: 'e.g. 8',
      inputType: 'number',
    },
  ],
  esp32: [
    {
      key: 'supplyVoltageMin',
      label: 'Supply Voltage Min (V)',
      placeholder: 'e.g. 3.0',
      inputType: 'number',
    },
    {
      key: 'supplyVoltageMax',
      label: 'Supply Voltage Max (V)',
      placeholder: 'e.g. 3.6',
      inputType: 'number',
    },
    {
      key: 'pinCount',
      label: 'GPIO Pins',
      placeholder: 'e.g. 10',
      inputType: 'number',
    },
  ],
  ground: [],
};

const nodeTypeTitles: Record<NodeTypeKey, string> = {
  voltageOutput: 'Voltage Supply',
  buck: 'Buck Converter',
  rfid: 'RFID Module',
  esp32: 'ESP32',
  ground: 'Ground',
  pinout: 'Header Pins',
};

function getDefaultConfigByType(type: NodeTypeKey): NodeConfig {
  if (type === 'buck') {
    return {
      inputVoltageMin: '10',
      inputVoltageMax: '14',
      outputVoltageMin: '3.2',
      outputVoltageMax: '3.4',
      maxCurrent: '1.5',
      efficiency: '92',
    };
  }

  if (type === 'rfid') {
    return {
      supplyVoltageMin: '3.0',
      supplyVoltageMax: '3.6',
      frequency: '13.56',
      protocol: 'ISO14443A',
      outputLogicWidth: '1',
    };
  }

  if (type === 'pinout') {
    return {
      pinCount: '8',
      inputLogicWidth: '8',
      pinName_1: 'GPIO 1',
      pinType_1: 'gpio',
      pinName_2: 'GPIO 2',
      pinType_2: 'gpio',
      pinName_3: 'GPIO 3',
      pinType_3: 'gpio',
      pinName_4: 'GPIO 4',
      pinType_4: 'gpio',
      pinName_5: 'GPIO 5',
      pinType_5: 'gpio',
      pinName_6: 'GPIO 6',
      pinType_6: 'gpio',
      pinName_7: 'GPIO 7',
      pinType_7: 'gpio',
      pinName_8: 'GPIO 8',
      pinType_8: 'gpio',
    };
  }

  if (type === 'esp32') {
    return {
      supplyVoltageMin: '3.0',
      supplyVoltageMax: '3.6',
      pinCount: '10',
      pinName_1: 'GPIO 0',
      pinName_2: 'GPIO 2',
      pinName_3: 'GPIO 4',
      pinName_4: 'GPIO 5',
      pinName_5: 'GPIO 12',
      pinName_6: 'GPIO 13',
      pinName_7: 'GPIO 14',
      pinName_8: 'GPIO 15',
      pinName_9: 'GPIO 18',
      pinName_10: 'GPIO 19',
    };
  }

  if (type === 'ground') {
    return {};
  }

  return {
    supplyInputType: 'USB-C',
    outputVoltageMin: '4.8',
    outputVoltageMax: '5.2',
    maxCurrent: '2.0',
    ripple: '50',
  };
}

const initialNodes: Node[] = [];

const initialNodesWithConfig: Node[] = initialNodes.map((node) => ({
  ...node,
  data: {
    config: getDefaultConfigByType(node.type as NodeTypeKey),
  },
}));

const initialEdges: Edge[] = [
  {
    id: 'voltage-buck',
    source: 'voltage-1',
    target: 'buck-1',
    style: {
      stroke: '#16a34a',
      strokeWidth: 2,
    },
    type: 'smoothstep',
  },
  {
    id: 'buck-rfid',
    source: 'buck-1',
    target: 'rfid-1',
    style: {
      stroke: '#16a34a',
      strokeWidth: 2,
    },
    type: 'smoothstep',
  },
];

const defaultEdgeOptions = {
  animated: false,
  style: {
    stroke: '#16a34a',
    strokeWidth: 2,
  },
  type: 'smoothstep' as const,
};

const warningEdgeOptions = {
  style: {
    stroke: '#dc2626',
    strokeWidth: 2,
  },
};

const dndType = 'application/ezpcb-node-type';

const nodesAtom = atomWithStorage<Node[]>(
  'pcb-canvas-nodes-v1',
  initialNodesWithConfig
);
const edgesAtom = atomWithStorage<Edge[]>('pcb-canvas-edges-v1', initialEdges);

function ensureNodeHasConfig(node: Node): Node {
  const hasConfig = Boolean(node.data?.config);
  if (hasConfig) return node;

  return {
    ...node,
    data: {
      ...node.data,
      config: getDefaultConfigByType(node.type as NodeTypeKey),
    },
  };
}

function parseVoltage(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInt(value?: string): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return Math.max(1, Math.floor(parsed));
}

function getRangeFromConfig(
  config: NodeConfig,
  minKey: string,
  maxKey: string,
  fallbackKey?: string
): NumericRange | null {
  const minValue = parseVoltage(config[minKey]);
  const maxValue = parseVoltage(config[maxKey]);

  if (minValue !== null && maxValue !== null) {
    return {
      min: Math.min(minValue, maxValue),
      max: Math.max(minValue, maxValue),
    };
  }

  if (fallbackKey) {
    const fallbackValue = parseVoltage(config[fallbackKey]);
    if (fallbackValue !== null) {
      return { min: fallbackValue, max: fallbackValue };
    }
  }

  if (minValue !== null) {
    return { min: minValue, max: minValue };
  }

  if (maxValue !== null) {
    return { min: maxValue, max: maxValue };
  }

  return null;
}

function rangesOverlap(a: NumericRange, b: NumericRange): boolean {
  return a.max >= b.min && b.max >= a.min;
}

function getConfiguredPinoutPinType(
  config: NodeConfig,
  handleId: string | null | undefined
): PinType {
  if (!handleId?.startsWith('pin-')) {
    return 'gpio';
  }

  const pinIndex = Number(handleId.replace('pin-', ''));
  if (!Number.isFinite(pinIndex) || pinIndex < 1) {
    return 'gpio';
  }

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

function getOutputVoltageRange(node: Node): NumericRange | null {
  const config = (node.data?.config ?? {}) as NodeConfig;

  if (node.type === 'voltageOutput') {
    return getRangeFromConfig(
      config,
      'outputVoltageMin',
      'outputVoltageMax',
      'outputVoltage'
    );
  }

  if (node.type === 'buck') {
    return getRangeFromConfig(
      config,
      'outputVoltageMin',
      'outputVoltageMax',
      'outputVoltage'
    );
  }

  return null;
}

function getInputVoltageRange(node: Node): NumericRange | null {
  const config = (node.data?.config ?? {}) as NodeConfig;

  if (node.type === 'buck') {
    return getRangeFromConfig(
      config,
      'inputVoltageMin',
      'inputVoltageMax',
      'inputVoltage'
    );
  }

  if (node.type === 'rfid') {
    return getRangeFromConfig(
      config,
      'supplyVoltageMin',
      'supplyVoltageMax',
      'supplyVoltage'
    );
  }

  if (node.type === 'esp32') {
    return getRangeFromConfig(
      config,
      'supplyVoltageMin',
      'supplyVoltageMax',
      'supplyVoltage'
    );
  }

  return null;
}

function getOutputLogicWidth(
  node: Node,
  sourceHandle?: string | null
): number | null {
  const config = (node.data?.config ?? {}) as NodeConfig;

  if (
    node.type === 'rfid' &&
    sourceHandle &&
    ['sda', 'sck', 'mosi', 'miso', 'irq', 'rst'].includes(sourceHandle)
  ) {
    return parsePositiveInt(config.outputLogicWidth) ?? 1;
  }

  if (node.type === 'pinout' && sourceHandle?.startsWith('pin-')) {
    return 1;
  }

  return null;
}

function getInputLogicWidth(
  node: Node,
  targetHandle?: string | null
): number | null {
  const config = (node.data?.config ?? {}) as NodeConfig;

  if (node.type === 'pinout' && targetHandle?.startsWith('pin-')) {
    const pinType = getConfiguredPinoutPinType(config, targetHandle);
    if (pinType !== 'gpio') {
      return null;
    }

    const configuredWidth = parsePositiveInt(config.inputLogicWidth);
    if (configuredWidth !== null) return configuredWidth;

    return parsePositiveInt(config.pinCount) ?? 1;
  }

  if (node.type === 'esp32' && targetHandle?.startsWith('gpio-')) {
    return 1;
  }

  return null;
}

function getSourcePinType(
  node: Node,
  sourceHandle?: string | null
): PinType | null {
  if (!sourceHandle) return null;

  if (node.type === 'voltageOutput' && sourceHandle === 'voltageOut') {
    return 'voltage-out';
  }

  if (node.type === 'buck' && sourceHandle === 'vout') {
    return 'voltage-out';
  }

  if (node.type === 'ground' && sourceHandle === 'groundOut') {
    return 'gnd';
  }

  if (node.type === 'esp32' && sourceHandle.startsWith('gpio-')) {
    return 'gpio';
  }

  if (
    node.type === 'rfid' &&
    ['sda', 'sck', 'mosi', 'miso', 'irq', 'rst'].includes(sourceHandle)
  ) {
    return 'gpio';
  }

  return null;
}

function getTargetPinType(
  node: Node,
  targetHandle?: string | null
): PinType | null {
  const config = (node.data?.config ?? {}) as NodeConfig;

  if (!targetHandle) return null;

  if (node.type === 'buck' && targetHandle === 'vin') {
    return 'voltage-in';
  }

  if (node.type === 'rfid') {
    if (targetHandle === 'vcc') return 'voltage-in';
    if (targetHandle === 'gnd') return 'gnd';
  }

  if (node.type === 'pinout') {
    if (targetHandle.startsWith('pin-')) {
      const pinType = getConfiguredPinoutPinType(config, targetHandle);
      return pinType === 'voltage-out' ? null : pinType;
    }
  }

  if (node.type === 'esp32') {
    if (targetHandle === 'vin') return 'voltage-in';
    if (targetHandle === 'gnd') return 'gnd';
    if (targetHandle.startsWith('gpio-')) return 'gpio';
  }

  return null;
}

function isPinTypeCompatible(
  sourceType: PinType,
  targetType: PinType
): boolean {
  if (sourceType === 'voltage-out' && targetType === 'voltage-in') {
    return true;
  }

  if (sourceType === 'gpio' && targetType === 'gpio') {
    return true;
  }

  if (sourceType === 'gnd' && targetType === 'gnd') {
    return true;
  }

  return false;
}

function isHandleAlreadyConnected(
  nodeId: string,
  handleId: string | null | undefined,
  edges: Edge[]
): boolean {
  if (!handleId) return false;

  return edges.some(
    (edge) =>
      (edge.source === nodeId && edge.sourceHandle === handleId) ||
      (edge.target === nodeId && edge.targetHandle === handleId)
  );
}

function validateConnection(
  connection: Connection | Edge,
  nodes: Node[],
  edges: Edge[]
): ValidationResult {
  const source = connection.source;
  const target = connection.target;
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;

  if (!source || !target) {
    return {
      kind: 'invalid',
      reason: 'Connection must have source and target.',
    };
  }

  if (source === target) {
    return { kind: 'invalid', reason: 'A node cannot connect to itself.' };
  }

  const alreadyExists = edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle ?? null) === sourceHandle &&
      (edge.targetHandle ?? null) === targetHandle
  );

  if (alreadyExists) {
    return { kind: 'invalid', reason: 'This connection already exists.' };
  }

  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);

  if (!sourceNode || !targetNode) {
    return { kind: 'invalid', reason: 'Could not resolve connection nodes.' };
  }

  const sourceVoltageRange = getOutputVoltageRange(sourceNode);
  const targetVoltageRange = getInputVoltageRange(targetNode);

  const sourcePinType = getSourcePinType(sourceNode, sourceHandle);
  const targetPinType = getTargetPinType(targetNode, targetHandle);

  if (
    sourcePinType === 'gpio' &&
    isHandleAlreadyConnected(source, sourceHandle, edges)
  ) {
    return {
      kind: 'invalid',
      reason: 'This GPIO source pin already has a connection.',
    };
  }

  if (
    targetPinType === 'gpio' &&
    isHandleAlreadyConnected(target, targetHandle, edges)
  ) {
    return {
      kind: 'invalid',
      reason: 'This GPIO target pin already has a connection.',
    };
  }

  if (
    sourcePinType !== null &&
    targetPinType !== null &&
    !isPinTypeCompatible(sourcePinType, targetPinType)
  ) {
    return {
      kind: 'invalid',
      reason: `Incompatible pin types: source ${sourcePinType} cannot connect to target ${targetPinType}.`,
    };
  }

  const sourceLogicWidth = getOutputLogicWidth(sourceNode, sourceHandle);
  const targetLogicWidth = getInputLogicWidth(targetNode, targetHandle);

  const warnings: string[] = [];

  if (
    sourceVoltageRange &&
    targetVoltageRange &&
    !rangesOverlap(sourceVoltageRange, targetVoltageRange)
  ) {
    warnings.push(
      `Voltage range mismatch: source ${sourceVoltageRange.min}-${sourceVoltageRange.max}V does not overlap target ${targetVoltageRange.min}-${targetVoltageRange.max}V.`
    );
  }

  if (
    sourcePinType === 'gpio' &&
    targetPinType === 'gpio' &&
    sourceLogicWidth !== null &&
    targetLogicWidth !== null &&
    targetLogicWidth > sourceLogicWidth
  ) {
    warnings.push(
      `Input logic width (${targetLogicWidth}-bit) is wider than output logic width (${sourceLogicWidth}-bit).`
    );
  }

  if (warnings.length > 0) {
    return {
      kind: 'warning',
      reason: warnings.join(' '),
    };
  }

  return { kind: 'valid' };
}

export default function PCBCanvas() {
  const [nodes, setNodes] = useAtom(nodesAtom);
  const [edges, setEdges] = useAtom(edgesAtom);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  const paletteItems: Array<{
    type: NodeTypeKey;
    title: string;
    subtitle: string;
  }> = [
    {
      type: 'voltageOutput',
      title: 'Voltage Supply',
      subtitle: 'USB-C / Barrel power source',
    },
    {
      type: 'buck',
      title: 'Buck Converter',
      subtitle: 'DC-DC step-down',
    },
    {
      type: 'rfid',
      title: 'RFID Module',
      subtitle: 'NFC / RFID endpoint',
    },
    {
      type: 'pinout',
      title: 'Header Pins',
      subtitle: 'Configurable pin header',
    },
    {
      type: 'esp32',
      title: 'ESP32',
      subtitle: 'Microcontroller pin bank',
    },
    {
      type: 'ground',
      title: 'Ground',
      subtitle: 'Ground reference node',
    },
  ];

  const filteredPaletteItems = paletteItems.filter((item) => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return true;

    return (
      item.title.toLowerCase().includes(query) ||
      item.subtitle.toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    setNodes((currentNodes) => currentNodes.map(ensureNodeHasConfig));
  }, [setNodes]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
    },
    [setEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = validateConnection(connection, nodes, edges);

      if (result.kind === 'invalid') {
        setConnectionError(result.reason ?? 'Connection is not valid.');
        return;
      }

      if (result.kind === 'warning') {
        const shouldContinue = window.confirm(
          `${result.reason}\n\nDo you want to create this connection anyway?`
        );

        if (!shouldContinue) {
          setConnectionError('Connection cancelled by user.');
          return;
        }

        setConnectionError(null);
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              ...defaultEdgeOptions,
              ...warningEdgeOptions,
            },
            eds
          )
        );
        return;
      }

      setConnectionError(null);
      setEdges((eds) => addEdge({ ...connection, ...defaultEdgeOptions }, eds));
    },
    [nodes, edges, setEdges]
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) =>
      validateConnection(connection, nodes, edges).kind !== 'invalid',
    [nodes, edges]
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const addNodeAtPosition = useCallback(
    (type: NodeTypeKey, position: { x: number; y: number }) => {
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        data: {
          config: getDefaultConfigByType(type),
        },
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        type,
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(newNode.id);
      setConnectionError(null);
    },
    [setNodes]
  );

  const onPaletteDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, type: NodeTypeKey) => {
      event.dataTransfer.setData(dndType, type);
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const onCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onCanvasDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!reactFlowInstance) {
        return;
      }

      const type = event.dataTransfer.getData(dndType) as NodeTypeKey;

      if (!type || !(type in nodeTypes)) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNodeAtPosition(type, position);
    },
    [reactFlowInstance, addNodeAtPosition]
  );

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  const selectedNodeType = selectedNode?.type as NodeTypeKey | undefined;

  const selectedNodeFields = selectedNodeType
    ? nodeFieldDefinitions[selectedNodeType]
    : [];

  const selectedNodePinCount = (() => {
    if (selectedNodeType !== 'pinout' && selectedNodeType !== 'esp32') return 0;

    const rawValue = (selectedNode?.data?.config?.pinCount ?? '1') as string;
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed)) return 1;

    return Math.max(1, Math.min(40, Math.floor(parsed)));
  })();

  const updateSelectedNodeField = useCallback(
    (fieldKey: string, value: string) => {
      if (!selectedNodeId) return;

      setConnectionError(null);

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== selectedNodeId) return node;

          const nextConfig = {
            ...(node.data?.config ?? {}),
            [fieldKey]: value,
          };

          return {
            ...node,
            data: {
              ...node.data,
              config: nextConfig,
            },
          };
        })
      );
    },
    [selectedNodeId, setNodes]
  );

  return (
    <div className='flex h-screen bg-white'>
      <aside className='flex w-72 flex-col border-r bg-slate-50 p-4'>
        <div className='mb-3'>
          <h2 className='text-sm font-semibold uppercase tracking-wide text-slate-700'>
            Component Repository
          </h2>
          <p className='mt-1 text-xs text-slate-500'>
            Search components and drag them into the canvas.
          </p>
        </div>

        <input
          value={paletteQuery}
          onChange={(event) => setPaletteQuery(event.target.value)}
          placeholder='Search components...'
          className='mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 transition focus:border-blue-500 focus:ring'
        />

        <div className='mb-3 text-xs text-slate-500'>
          {filteredPaletteItems.length} of {paletteItems.length} components
        </div>

        <div className='space-y-2 overflow-y-auto'>
          {filteredPaletteItems.map((item) => (
            <button
              key={item.type}
              draggable
              onDragStart={(event) => onPaletteDragStart(event, item.type)}
              className='w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm'
            >
              <div className='text-sm font-semibold text-slate-800'>
                {item.title}
              </div>
              <p className='mt-1 text-xs text-slate-500'>{item.subtitle}</p>
            </button>
          ))}

          {filteredPaletteItems.length === 0 ? (
            <div className='rounded-md border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500'>
              No components match that search.
            </div>
          ) : null}
        </div>

        <div className='mt-4 border-t pt-3 text-xs text-slate-500'>
          {nodes.length} components | {edges.length} connections
        </div>
      </aside>

      <div className='flex flex-1 overflow-hidden'>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={setReactFlowInstance}
          onDrop={onCanvasDrop}
          onDragOver={onCanvasDragOver}
          nodesDraggable
          panOnDrag
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 2 }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className='flex-1'
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>

        <aside className='w-80 border-l bg-slate-50 p-4'>
          {!selectedNode ? (
            <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600'>
              Select a node to edit its parameters.
            </div>
          ) : (
            <div className='space-y-4'>
              <div>
                <h3 className='text-lg font-semibold text-slate-800'>
                  {nodeTypeTitles[selectedNodeType as NodeTypeKey]}
                </h3>
                <p className='text-xs text-slate-500'>
                  Node ID: {selectedNode.id}
                </p>
              </div>

              {selectedNodeFields.map((field) => {
                const value = (selectedNode.data?.config?.[field.key] ??
                  '') as string;

                return (
                  <label key={field.key} className='block'>
                    <div className='mb-1 text-sm font-medium text-slate-700'>
                      {field.label}
                    </div>
                    {field.inputType === 'select' ? (
                      <select
                        value={value || field.options?.[0] || ''}
                        onChange={(event) =>
                          updateSelectedNodeField(field.key, event.target.value)
                        }
                        className='w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 transition focus:border-blue-500 focus:ring'
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={value}
                        onChange={(event) =>
                          updateSelectedNodeField(
                            field.key,
                            field.key === 'pinCount'
                              ? String(
                                  Math.max(
                                    1,
                                    Math.min(
                                      40,
                                      Number(event.target.value || '1') || 1
                                    )
                                  )
                                )
                              : event.target.value
                          )
                        }
                        placeholder={field.placeholder}
                        type={field.inputType ?? 'text'}
                        step={field.inputType === 'number' ? 'any' : undefined}
                        min={field.key === 'pinCount' ? 1 : undefined}
                        max={field.key === 'pinCount' ? 40 : undefined}
                        className='w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 transition focus:border-blue-500 focus:ring'
                      />
                    )}
                  </label>
                );
              })}

              {selectedNodeType === 'pinout' || selectedNodeType === 'esp32' ? (
                <div className='space-y-2'>
                  <div className='border-t pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500'>
                    Pin Names
                  </div>

                  {Array.from({ length: selectedNodePinCount }, (_, index) => {
                    const key = `pinName_${index + 1}`;
                    const value = (selectedNode.data?.config?.[key] ??
                      `Pin ${index + 1}`) as string;

                    return (
                      <label key={key} className='block'>
                        <div className='mb-1 text-sm font-medium text-slate-700'>
                          Pin {index + 1}
                        </div>
                        <input
                          value={value}
                          onChange={(event) =>
                            updateSelectedNodeField(key, event.target.value)
                          }
                          placeholder={`Pin ${index + 1}`}
                          className='w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 transition focus:border-blue-500 focus:ring'
                        />

                        {selectedNodeType === 'pinout' ? (
                          <select
                            value={
                              (selectedNode.data?.config?.[
                                `pinType_${index + 1}`
                              ] as string) || 'gpio'
                            }
                            onChange={(event) =>
                              updateSelectedNodeField(
                                `pinType_${index + 1}`,
                                event.target.value
                              )
                            }
                            className='mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-blue-200 transition focus:border-blue-500 focus:ring'
                          >
                            <option value='gpio'>GPIO</option>
                            <option value='voltage-in'>Voltage Input</option>
                            <option value='voltage-out'>Voltage Output</option>
                            <option value='gnd'>GND</option>
                          </select>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}

          {connectionError ? (
            <div className='mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700'>
              {connectionError}
            </div>
          ) : (
            <div className='mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700'>
              Range validation is active. Source/target voltage ranges should
              overlap, and input logic width should not exceed output logic
              width.
            </div>
          )}
        </aside>
      </div>

      <style jsx global>{`
        .react-flow__edge-path {
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .react-flow__connection-path {
          stroke-linecap: round;
          stroke-dasharray: 5 6;
          animation: connectionDash 0.75s linear infinite;
        }

        .react-flow__handle {
          width: 12px;
          height: 12px;
          border: 2px solid #64748b;
          background: #fff;
          transition: transform 0.15s ease;
        }

        .react-flow__handle:hover,
        .react-flow__handle-connecting,
        .react-flow__handle-valid {
          transform: scale(1.15);
          border-color: #2563eb;
          box-shadow: 0 0 0 3px #dbeafe;
        }

        .react-flow__node.selected > div {
          box-shadow: 0 0 0 3px #bfdbfe;
        }

        @keyframes connectionDash {
          to {
            stroke-dashoffset: -11;
          }
        }
      `}</style>
    </div>
  );
}
