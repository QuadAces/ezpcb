import { JlcPart } from '@/library/jlcParts';

type Size = { width: number; height: number };

const IMPERIAL_PACKAGE_MM: Record<string, Size> = {
  '0201': { width: 0.6, height: 0.3 },
  '0402': { width: 1.0, height: 0.5 },
  '0603': { width: 1.6, height: 0.8 },
  '0805': { width: 2.0, height: 1.25 },
  '1206': { width: 3.2, height: 1.6 },
  '1210': { width: 3.2, height: 2.5 },
  '1812': { width: 4.5, height: 3.2 },
  '2010': { width: 5.0, height: 2.5 },
  '2512': { width: 6.35, height: 3.2 },
};

function parseSizePair(raw: string): Size | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    width: Math.max(width, 0.5),
    height: Math.max(height, 0.5),
  };
}

function inferPinCountFromText(
  part: Pick<JlcPart, 'package' | 'description' | 'manufacturerPartNumber'>
): number {
  const candidate = `${part.package} ${part.description} ${part.manufacturerPartNumber}`;

  const qfp = candidate.match(
    /(?:QFN|QFP|LQFP|TQFP|QFPN|DFN|SOIC|SOP|MSOP|TSSOP|SSOP|USON|QFN)\s*[-_ ]?(\d{1,3})/i
  );
  if (qfp) {
    return Math.max(2, Number(qfp[1]));
  }

  const genericPin = candidate.match(/(?:^|\W)(\d{1,3})\s*P(?:IN)?(?:\W|$)/i);
  if (genericPin) {
    return Math.max(2, Number(genericPin[1]));
  }

  if (/SOT-23/i.test(candidate)) {
    const sot23n = candidate.match(/SOT-23-?(\d)/i);
    if (sot23n) {
      return Math.max(3, Number(sot23n[1]));
    }
    return 3;
  }

  return 2;
}

function inferBodySizeMm(part: Pick<JlcPart, 'package' | 'description'>): Size {
  const packageText = part.package ?? '';
  const descriptionText = part.description ?? '';

  const imperialMatch = packageText.match(
    /\b(0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/
  );
  if (imperialMatch) {
    return IMPERIAL_PACKAGE_MM[imperialMatch[1]];
  }

  const fromPackage = parseSizePair(packageText);
  if (fromPackage) {
    return fromPackage;
  }

  const fromDescription = parseSizePair(descriptionText);
  if (fromDescription) {
    return fromDescription;
  }

  if (/LQFP|QFP|QFN|TQFP/i.test(packageText)) {
    return { width: 10, height: 10 };
  }

  if (/SOT|SOP|SOIC|SSOP|TSSOP|MSOP|USON|DFN/i.test(packageText)) {
    return { width: 3, height: 3 };
  }

  if (/PinHeader|Header|Connector/i.test(descriptionText + ' ' + packageText)) {
    return { width: 10, height: 2.54 };
  }

  return { width: 2, height: 1.25 };
}

export function enrichPartGeometry(part: JlcPart): JlcPart {
  const bodySizeMm = part.bodySizeMm ?? inferBodySizeMm(part);
  const pinCount = part.pinCount ?? inferPinCountFromText(part);

  return {
    ...part,
    bodySizeMm,
    pinCount,
  };
}
