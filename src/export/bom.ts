import { FlattenedPcb } from '@/types/pcb';

type BomBucket = {
  qty: number;
  designators: string[];
  value: string;
  footprint: string;
  lcscPartNumber: string;
  manufacturerPartNumber: string;
  description: string;
};

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function createBomCsv(flattened: FlattenedPcb): string {
  const buckets = new Map<string, BomBucket>();

  flattened.components.forEach((component) => {
    const lcscPartNumber = component.lcscPartNumber ?? '';
    const manufacturerPartNumber = component.manufacturerPartNumber ?? '';
    const description = component.partDescription ?? component.type;
    const key = [
      lcscPartNumber,
      manufacturerPartNumber,
      component.value ?? '',
      component.footprint,
    ].join('|');

    const existing = buckets.get(key);
    if (existing) {
      existing.qty += 1;
      existing.designators.push(component.designator);
      return;
    }

    buckets.set(key, {
      qty: 1,
      designators: [component.designator],
      value: component.value ?? '',
      footprint: component.footprint,
      lcscPartNumber,
      manufacturerPartNumber,
      description,
    });
  });

  const header = [
    'Comment',
    'Designator',
    'Footprint',
    'LCSC Part #',
    'Mfr Part #',
    'Quantity',
    'Description',
  ];

  const rows = Array.from(buckets.values())
    .sort((a, b) => a.designators[0].localeCompare(b.designators[0]))
    .map((bucket) => [
      bucket.value,
      bucket.designators.sort().join(','),
      bucket.footprint,
      bucket.lcscPartNumber,
      bucket.manufacturerPartNumber,
      String(bucket.qty),
      bucket.description,
    ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(','))
    .join('\n');
}
