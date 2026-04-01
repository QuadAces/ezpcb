import Fuse from 'fuse.js';
import { NextResponse } from 'next/server';
import { gunzipSync } from 'zlib';

import { JLC_PARTS } from '@/library/jlcParts';
import { enrichPartGeometry } from '@/library/partGeometry';

export const runtime = 'nodejs';

type SearchParams = {
  query: string;
  footprint: string;
  limit: number;
  source: 'local' | 'remote';
};

function parseParams(request: Request): SearchParams {
  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim();
  const footprint = (url.searchParams.get('footprint') ?? '').trim();
  const limit = Number(url.searchParams.get('limit') ?? 15);
  const sourceRaw = (url.searchParams.get('source') ?? 'local').toLowerCase();

  return {
    query,
    footprint,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 30)) : 15,
    source: sourceRaw === 'remote' ? 'remote' : 'local',
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

type CatalogLeaf = {
  sourcename: string;
  datahash: string;
  stockhash: string;
};

type CatalogIndex = {
  categories: Record<string, Record<string, CatalogLeaf>>;
};

type CatalogAttribute = {
  values?: Record<string, [string, string]>;
};

type CatalogComponent = {
  lcsc: string;
  mfr: string;
  description: string;
  attributes?: Record<string, CatalogAttribute>;
};

type CatalogData = {
  schema: string[];
  components: unknown[][];
};

type IndexedCategory = {
  category: string;
  subcategory: string;
  sourcename: string;
};

type LcscDetailResponse = {
  result?: {
    productCode?: string;
    productModel?: string;
    productNameEn?: string;
    productIntroEn?: string;
    brandNameEn?: string;
    productDescEn?: string;
    parentCatalogName?: string;
    catalogName?: string;
    encapStandard?: string;
    paramVOList?: Array<{
      paramNameEn?: string;
      paramValueEn?: string;
    }>;
  };
};

const CATALOG_BASE = 'https://yaqwsx.github.io/jlcparts/data';
const LCSC_DETAIL_BASE =
  'https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=';
const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;
const CATEGORY_CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_REMOTE_CATEGORIES = 4;

let indexCache: { expiresAt: number; data: CatalogIndex } | null = null;
const categoryCache = new Map<
  string,
  { expiresAt: number; data: CatalogComponent[] }
>();

function getCachedCategory(sourcename: string) {
  const cached = categoryCache.get(sourcename);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt < Date.now()) {
    categoryCache.delete(sourcename);
    return null;
  }
  return cached.data;
}

function readAttr(
  attributes: CatalogComponent['attributes'],
  name: string
): string | null {
  const raw = attributes?.[name]?.values;
  if (!raw) {
    return null;
  }
  const defaultValue = raw.default?.[0];
  if (defaultValue) {
    return defaultValue;
  }
  const first = Object.values(raw)[0]?.[0];
  return typeof first === 'string' ? first : null;
}

function parseSizeFromPackageText(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/,/g, '.');
  const parenSize = normalized.match(
    /\((\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)\)/
  );
  const inlineSize = normalized.match(
    /(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/
  );
  const match = parenSize ?? inlineSize;
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    width: Math.max(0.5, width),
    height: Math.max(0.5, height),
  };
}

function parseMmValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/,/g, '.');
  const withUnit = normalized.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
  const plain = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
  const token = withUnit?.[1] ?? plain?.[1];
  if (!token) {
    return null;
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBodySizeFromDetail(detail: LcscDetailResponse['result']) {
  if (!detail) {
    return null;
  }

  const textCandidates = [
    detail.encapStandard,
    detail.productNameEn,
    detail.productIntroEn,
    detail.productDescEn,
    ...(detail.paramVOList?.map((p) => p.paramValueEn).filter(Boolean) ?? []),
  ];

  for (const candidate of textCandidates) {
    const parsed = parseSizeFromPackageText(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const widthParam = detail.paramVOList?.find((p) =>
    /\b(width|body\s*width|w)\b/i.test(p.paramNameEn ?? '')
  );
  const lengthParam = detail.paramVOList?.find((p) =>
    /\b(length|body\s*length|l|depth)\b/i.test(p.paramNameEn ?? '')
  );

  const width = parseMmValue(widthParam?.paramValueEn);
  const length = parseMmValue(lengthParam?.paramValueEn);

  if (width && length) {
    return {
      width: Math.max(0.5, width),
      height: Math.max(0.5, length),
    };
  }

  return null;
}

function mapDetailToPart(detail: LcscDetailResponse['result']) {
  if (!detail?.productCode) {
    return null;
  }

  const packageFromParams =
    detail.paramVOList?.find((p) => p.paramNameEn === 'Package')
      ?.paramValueEn ?? null;
  const packageName = detail.encapStandard || packageFromParams || 'Generic';
  const categoryName =
    detail.catalogName || detail.parentCatalogName || 'Electronic Component';

  const basePart = {
    lcscPartNumber: detail.productCode,
    manufacturerPartNumber: detail.productModel || detail.productCode,
    manufacturer: detail.brandNameEn || 'Unknown',
    description:
      detail.productDescEn || detail.productModel || detail.productCode,
    package: packageName,
    category: categoryName,
    basicPart: false,
  };

  const bodySizeMm =
    extractBodySizeFromDetail(detail) ?? parseSizeFromPackageText(packageName);
  return enrichPartGeometry(
    bodySizeMm
      ? {
          ...basePart,
          bodySizeMm,
        }
      : basePart
  );
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; modstract-bot/1.0)',
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/gzip') || url.endsWith('.gz')) {
    const payload = Buffer.from(await response.arrayBuffer());
    return JSON.parse(gunzipSync(payload).toString('utf8'));
  }

  return response.json();
}

async function fetchCatalogIndex() {
  if (indexCache && indexCache.expiresAt > Date.now()) {
    return indexCache.data;
  }
  const data = (await fetchJson(`${CATALOG_BASE}/index.json`)) as CatalogIndex;
  indexCache = {
    data,
    expiresAt: Date.now() + INDEX_CACHE_TTL_MS,
  };
  return data;
}

function flattenCategories(index: CatalogIndex): IndexedCategory[] {
  const categories: IndexedCategory[] = [];
  for (const [category, subcategories] of Object.entries(
    index.categories || {}
  )) {
    for (const [subcategory, leaf] of Object.entries(subcategories || {})) {
      if (!leaf?.sourcename) {
        continue;
      }
      categories.push({
        category,
        subcategory,
        sourcename: leaf.sourcename,
      });
    }
  }
  return categories;
}

async function fetchCategoryComponents(sourcename: string) {
  const cached = getCachedCategory(sourcename);
  if (cached) {
    return cached;
  }

  const data = (await fetchJson(
    `${CATALOG_BASE}/${encodeURIComponent(sourcename)}.json.gz`
  )) as CatalogData;

  const restored = (data.components || []).map((row) => {
    return data.schema.reduce((acc, key, idx) => {
      acc[key] = row[idx];
      return acc;
    }, {} as Record<string, unknown>);
  }) as CatalogComponent[];

  categoryCache.set(sourcename, {
    data: restored,
    expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS,
  });

  return restored;
}

async function fetchLcscDetail(lcscPartNumber: string) {
  try {
    const detail = (await fetchJson(
      `${LCSC_DETAIL_BASE}${encodeURIComponent(lcscPartNumber)}`
    )) as LcscDetailResponse;
    return mapDetailToPart(detail.result);
  } catch {
    return null;
  }
}

function mapCatalogComponentToPart(
  component: CatalogComponent,
  categoryName: string
) {
  const packageName = readAttr(component.attributes, 'Package') ?? 'Generic';
  const manufacturer =
    readAttr(component.attributes, 'Manufacturer') ??
    (component.mfr.split(/\s+/)[0] || 'Unknown');
  const basicExtended = readAttr(component.attributes, 'Basic/Extended') ?? '';
  const isBasic = /^basic$/i.test(basicExtended.trim());
  const bodySizeMm =
    parseSizeFromPackageText(packageName) ??
    parseSizeFromPackageText(component.description);

  return enrichPartGeometry({
    lcscPartNumber: component.lcsc,
    manufacturerPartNumber: component.mfr,
    manufacturer,
    description: normalizeWhitespace(component.description || component.mfr),
    package: packageName,
    category: categoryName,
    basicPart: isBasic,
    ...(bodySizeMm ? { bodySizeMm } : {}),
  });
}

async function searchRemote(query: string, footprint: string, limit: number) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  if (/^C\d{3,9}$/i.test(normalizedQuery)) {
    const direct = await fetchLcscDetail(normalizedQuery.toUpperCase());
    if (direct) {
      return [direct];
    }
  }

  const index = await fetchCatalogIndex();
  const flattened = flattenCategories(index);
  if (flattened.length === 0) {
    return [];
  }

  const categoryFuse = new Fuse(flattened, {
    includeScore: true,
    threshold: 0.4,
    keys: [
      { name: 'category', weight: 0.4 },
      { name: 'subcategory', weight: 0.5 },
      { name: 'sourcename', weight: 0.1 },
    ],
  });

  const categoryMatches = categoryFuse
    .search(normalizedQuery, { limit: MAX_REMOTE_CATEGORIES })
    .map((m) => m.item);

  const selectedCategories =
    categoryMatches.length > 0
      ? categoryMatches
      : flattened.slice(0, Math.min(MAX_REMOTE_CATEGORIES, flattened.length));

  const remoteCandidates: ReturnType<typeof enrichPartGeometry>[] = [];

  for (const category of selectedCategories) {
    const components = await fetchCategoryComponents(category.sourcename);
    const mapped = components.map((component) =>
      mapCatalogComponentToPart(component, category.subcategory)
    );
    remoteCandidates.push(...mapped);
  }

  const footprintNormalized = footprint.toLowerCase();
  const filteredByFootprint = footprintNormalized
    ? remoteCandidates.filter((part) =>
        part.package.toLowerCase().includes(footprintNormalized)
      )
    : remoteCandidates;

  const remoteFuse = new Fuse(filteredByFootprint, {
    includeScore: true,
    threshold: 0.35,
    keys: [
      { name: 'lcscPartNumber', weight: 0.3 },
      { name: 'manufacturerPartNumber', weight: 0.25 },
      { name: 'description', weight: 0.2 },
      { name: 'manufacturer', weight: 0.1 },
      { name: 'package', weight: 0.1 },
      { name: 'category', weight: 0.05 },
    ],
  });

  const ranked = remoteFuse
    .search(normalizedQuery, { limit })
    .map((hit) => hit.item);
  if (ranked.length === 0) {
    return [];
  }

  const detailEnriched = await Promise.all(
    ranked.map(async (part) => {
      const detailPart = await fetchLcscDetail(part.lcscPartNumber);
      return detailPart
        ? {
            ...part,
            package: detailPart.package || part.package,
            pinCount: detailPart.pinCount ?? part.pinCount,
            bodySizeMm: detailPart.bodySizeMm ?? part.bodySizeMm,
          }
        : part;
    })
  );

  return detailEnriched;
}

export async function GET(request: Request) {
  const { query, footprint, limit, source } = parseParams(request);

  if (source === 'remote') {
    try {
      const remoteParts = await searchRemote(query, footprint, limit);
      if (remoteParts.length > 0) {
        return NextResponse.json({ parts: remoteParts, source: 'remote' });
      }
    } catch {
      // Fall through to local fallback.
    }
  }

  const localSource = footprint
    ? JLC_PARTS.filter((part) =>
        part.package.toLowerCase().includes(footprint.toLowerCase())
      )
    : JLC_PARTS;

  const enrichedLocal = localSource.map(enrichPartGeometry);

  if (!query) {
    return NextResponse.json({
      parts: enrichedLocal.slice(0, limit),
      source: 'local',
    });
  }

  const fuse = new Fuse(enrichedLocal, {
    threshold: 0.35,
    includeScore: true,
    keys: [
      { name: 'lcscPartNumber', weight: 0.3 },
      { name: 'manufacturerPartNumber', weight: 0.25 },
      { name: 'description', weight: 0.25 },
      { name: 'category', weight: 0.1 },
      { name: 'package', weight: 0.1 },
    ],
  });

  const results = fuse.search(query, { limit }).map((item) => item.item);

  return NextResponse.json({ parts: results, source: 'local' });
}
