import {
  Component,
  ExposedPin,
  FlattenedPcb,
  Module,
  Net,
  NetConnection,
  PcbProject,
} from '@/types/pcb';

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function mergeConnectionMap(
  map: Map<string, NetConnection[]>,
  netId: string,
  connection: NetConnection
) {
  const existing = map.get(netId) ?? [];
  existing.push(connection);
  map.set(netId, existing);
}

function transformComponent(
  component: Component,
  prefix: string,
  offsetX: number,
  offsetY: number,
  rotation: number,
  layer: 'top' | 'bottom'
): Component {
  const rotated = rotatePoint(
    component.position.x,
    component.position.y,
    rotation
  );

  return {
    ...component,
    id: `${prefix}.${component.id}`,
    designator: `${component.designator}_${prefix}`,
    position: {
      x: rotated.x + offsetX,
      y: rotated.y + offsetY,
    },
    rotation: (component.rotation + rotation) % 360,
    layer,
    pins: component.pins.map((pin) => ({
      ...pin,
      id: `${prefix}.${pin.id}`,
      netId: pin.netId ? `${prefix}.${pin.netId}` : pin.netId,
    })),
  };
}

function findExposedPin(
  exposedPins: ExposedPin[],
  pinId: string
): ExposedPin | undefined {
  return exposedPins.find((pin) => pin.id === pinId);
}

function flattenModuleInternal(
  module: Module,
  moduleLibrary: Record<string, Module>,
  prefix: string,
  offsetX: number,
  offsetY: number,
  rotation: number,
  layer: 'top' | 'bottom',
  netMap: Map<string, NetConnection[]>,
  components: Component[]
) {
  module.components.forEach((component) => {
    const transformed = transformComponent(
      component,
      prefix,
      offsetX,
      offsetY,
      rotation,
      layer
    );
    components.push(transformed);

    transformed.pins.forEach((pin) => {
      if (!pin.netId) {
        return;
      }

      mergeConnectionMap(netMap, pin.netId, {
        componentId: transformed.id,
        pinId: pin.id,
      });
    });
  });

  module.submodules.forEach((instance) => {
    const child = moduleLibrary[instance.moduleId];
    if (!child) {
      return;
    }

    const rotated = rotatePoint(
      instance.position.x,
      instance.position.y,
      rotation
    );
    const childPrefix = `${prefix}.${instance.id}`;

    flattenModuleInternal(
      child,
      moduleLibrary,
      childPrefix,
      rotated.x + offsetX,
      rotated.y + offsetY,
      (rotation + instance.rotation) % 360,
      instance.layer,
      netMap,
      components
    );

    Object.entries(instance.pinMap).forEach(([exposedPinId, parentNetId]) => {
      const exposedPin = findExposedPin(child.exposedPins, exposedPinId);
      if (!exposedPin) {
        return;
      }

      const internalNetId = `${childPrefix}.${exposedPin.internalNetId}`;
      const childConnections = netMap.get(internalNetId) ?? [];
      childConnections.forEach((connection) => {
        mergeConnectionMap(netMap, parentNetId, connection);
      });
    });
  });
}

export function flattenProject(project: PcbProject): FlattenedPcb {
  const components: Component[] = [];
  const netMap = new Map<string, NetConnection[]>();

  flattenModuleInternal(
    project.rootModule,
    project.moduleLibrary,
    'root',
    0,
    0,
    0,
    'top',
    netMap,
    components
  );

  project.rootModule.nets.forEach((net) => {
    const namespaced = `root.${net.id}`;
    const scopedConnections = netMap.get(namespaced) ?? [];
    netMap.set(net.id, scopedConnections);
  });

  const nets: Net[] = Array.from(netMap.entries())
    .filter(([, connections]) => connections.length > 0)
    .map(([id, connections]) => ({
      id,
      name: id,
      connections,
    }));

  return {
    components,
    nets,
    traces: project.traces,
    board: project.board,
  };
}
