export type JlcPart = {
  lcscPartNumber: string;
  manufacturerPartNumber: string;
  manufacturer: string;
  description: string;
  package: string;
  category: string;
  basicPart: boolean;
  pinCount?: number;
  bodySizeMm?: {
    width: number;
    height: number;
  };
};

// Seed subset of commonly used JLC/LCSC parts.
export const JLC_PARTS: JlcPart[] = [
  {
    lcscPartNumber: 'C17414',
    manufacturerPartNumber: 'RC0805FR-0710KL',
    manufacturer: 'Yageo',
    description: 'Resistor 10k Ohm 1% 1/8W',
    package: '0805',
    category: 'Resistor',
    basicPart: true,
  },
  {
    lcscPartNumber: 'C17408',
    manufacturerPartNumber: 'RC0805FR-071KL',
    manufacturer: 'Yageo',
    description: 'Resistor 1k Ohm 1% 1/8W',
    package: '0805',
    category: 'Resistor',
    basicPart: true,
  },
  {
    lcscPartNumber: 'C49678',
    manufacturerPartNumber: 'CL21B104KBCNNNC',
    manufacturer: 'Samsung',
    description: 'Capacitor 100nF 50V X7R 0805',
    package: '0805',
    category: 'Capacitor',
    basicPart: true,
  },
  {
    lcscPartNumber: 'C15849',
    manufacturerPartNumber: 'CL21A106KAYNNNE',
    manufacturer: 'Samsung',
    description: 'Capacitor 10uF 25V X5R 0805',
    package: '0805',
    category: 'Capacitor',
    basicPart: true,
  },
  {
    lcscPartNumber: 'C52923',
    manufacturerPartNumber: 'LM1117-3.3',
    manufacturer: 'TI',
    description: 'LDO Regulator 3.3V 800mA',
    package: 'SOT-223',
    category: 'Power',
    basicPart: false,
  },
  {
    lcscPartNumber: 'C15127',
    manufacturerPartNumber: 'STM32F103C8T6',
    manufacturer: 'STMicroelectronics',
    description: 'ARM Cortex-M3 MCU 64KB Flash',
    package: 'LQFP-48',
    category: 'MCU',
    basicPart: false,
  },
  {
    lcscPartNumber: 'C165948',
    manufacturerPartNumber: 'CH340C',
    manufacturer: 'WCH',
    description: 'USB to UART Bridge',
    package: 'SOP-16',
    category: 'Interface',
    basicPart: false,
  },
  {
    lcscPartNumber: 'C7420338',
    manufacturerPartNumber: 'USBLC6-2SC6',
    manufacturer: 'STMicroelectronics',
    description: 'USB ESD Protection Array',
    package: 'SOT-23-6',
    category: 'Protection',
    basicPart: false,
  },
];
