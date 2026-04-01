export type Layer = 'top' | 'bottom';

export type Pin = {
  id: string;
  name: string;
  netId?: string;
};

export type Position = {
  x: number;
  y: number;
};

export type Bounds = {
  width: number;
  height: number;
};

export type Via = {
  x: number;
  y: number;
  drillMm: number;
  padMm: number;
};

export type Trace = {
  id: string;
  netId?: string;
  layer: Layer;
  widthMm: number;
  points: Position[];
  vias: Via[];
};

export type Component = {
  id: string;
  type: string;
  designator: string;
  footprint: string;
  position: Position;
  rotation: number;
  layer: Layer;
  value?: string;
  lcscPartNumber?: string;
  manufacturerPartNumber?: string;
  partDescription?: string;
  pins: Pin[];
  bounds: Bounds;
};

export type NetConnection = {
  componentId: string;
  pinId: string;
};

export type Net = {
  id: string;
  name: string;
  connections: NetConnection[];
};

export type ExposedPin = {
  id: string;
  name: string;
  internalNetId: string;
};

export type ModuleInstance = {
  id: string;
  moduleId: string;
  name: string;
  position: Position;
  rotation: number;
  layer: Layer;
  pinMap: Record<string, string>;
};

export type Module = {
  id: string;
  name: string;
  components: Component[];
  nets: Net[];
  submodules: ModuleInstance[];
  exposedPins: ExposedPin[];
};

export type PcbProject = {
  id: string;
  name: string;
  rootModule: Module;
  traces: Trace[];
  moduleLibrary: Record<string, Module>;
  gridSizeMm: number;
  board: {
    width: number;
    height: number;
    origin: Position;
    twoLayer: boolean;
  };
};

export type FlattenedPcb = {
  components: Component[];
  nets: Net[];
  traces: Trace[];
  board: PcbProject['board'];
};

export type Collision = {
  firstId: string;
  secondId: string;
};
