import { Bounds, Component, Pin } from '@/types/pcb';

type CatalogComponent = {
  type: string;
  designatorPrefix: string;
  footprint: string;
  value: string;
  bounds: Bounds;
  pins: Pin[];
};

export const COMPONENT_LIBRARY: CatalogComponent[] = [
  {
    type: 'Resistor',
    designatorPrefix: 'R',
    footprint: 'R_0805',
    value: '10k',
    bounds: { width: 2, height: 1.25 },
    pins: [
      { id: '1', name: '1' },
      { id: '2', name: '2' },
    ],
  },
  {
    type: 'Capacitor',
    designatorPrefix: 'C',
    footprint: 'C_0805',
    value: '100n',
    bounds: { width: 2, height: 1.25 },
    pins: [
      { id: '1', name: '1' },
      { id: '2', name: '2' },
    ],
  },
  {
    type: 'IC',
    designatorPrefix: 'U',
    footprint: 'TQFP-32',
    value: 'MCU',
    bounds: { width: 7, height: 7 },
    pins: [
      { id: 'VCC', name: 'VCC' },
      { id: 'GND', name: 'GND' },
      { id: 'IO1', name: 'IO1' },
      { id: 'IO2', name: 'IO2' },
    ],
  },
  {
    type: 'Connector',
    designatorPrefix: 'J',
    footprint: 'PinHeader_1x04',
    value: 'HDR',
    bounds: { width: 10, height: 2.54 },
    pins: [
      { id: '1', name: '1' },
      { id: '2', name: '2' },
      { id: '3', name: '3' },
      { id: '4', name: '4' },
    ],
  },
  {
    type: 'Power',
    designatorPrefix: 'PWR',
    footprint: 'TestPoint',
    value: '3V3',
    bounds: { width: 1.5, height: 1.5 },
    pins: [{ id: 'OUT', name: 'OUT' }],
  },
  {
    type: 'Ground',
    designatorPrefix: 'GND',
    footprint: 'TestPoint',
    value: 'GND',
    bounds: { width: 1.5, height: 1.5 },
    pins: [{ id: 'GND', name: 'GND' }],
  },
];

export function createCatalogComponent(
  index: number,
  id: string,
  designatorCount: number,
  position = { x: 0, y: 0 }
): Component {
  const base = COMPONENT_LIBRARY[index];
  return {
    id,
    type: base.type,
    designator: `${base.designatorPrefix}${designatorCount}`,
    footprint: base.footprint,
    value: base.value,
    position,
    rotation: 0,
    layer: 'top',
    pins: base.pins.map((pin) => ({ ...pin })),
    bounds: base.bounds,
  };
}
