import { FlattenedPcb } from '@/types/pcb';

function toPnpLayer(layer: 'top' | 'bottom') {
  return layer === 'top' ? 'Top' : 'Bottom';
}

export function createPnpCsv(flattened: FlattenedPcb): string {
  const header = 'Designator,Mid X (mm),Mid Y (mm),Layer,Rotation';
  const lines = flattened.components.map((component) => {
    return [
      component.designator,
      component.position.x.toFixed(3),
      component.position.y.toFixed(3),
      toPnpLayer(component.layer),
      String(component.rotation),
    ].join(',');
  });

  return [header, ...lines].join('\n');
}
