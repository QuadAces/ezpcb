import Fuse from 'fuse.js';
import { NextResponse } from 'next/server';

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

function parseRemotePartsFromHtml(html: string, limit: number) {
  const text = normalizeWhitespace(html.replace(/<[^>]*>/g, ' '));
  const tokenRegex =
    /([A-Za-z0-9_()+\-./]{3,})\s+(C\d{3,9})\s+(Basic|Extended|Economic|Standard)/g;
  const parsed: ReturnType<typeof enrichPartGeometry>[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) && parsed.length < limit) {
    const mpn = match[1];
    const lcsc = match[2];
    const basic = match[3].toLowerCase() === 'basic';
    if (seen.has(lcsc)) {
      continue;
    }
    seen.add(lcsc);

    const windowStart = Math.max(0, match.index - 220);
    const windowEnd = Math.min(text.length, tokenRegex.lastIndex + 280);
    const context = text.slice(windowStart, windowEnd);

    const packageMatch = context.match(
      /\b(?:0201|0402|0603|0805|1206|1210|1812|2010|2512|SOT-23(?:-\d)?|SOT-223|SOP-\d+|SOIC-\d+|QFN-?\d+|LQFP-?\d+|TQFP-?\d+|DFN-?\d+|MSOP-?\d+|SSOP-?\d+)\b/i
    );
    const packageName = packageMatch?.[0] ?? 'Generic';

    parsed.push(
      enrichPartGeometry({
        lcscPartNumber: lcsc,
        manufacturerPartNumber: mpn,
        manufacturer: 'JLC Catalog',
        description: context.slice(0, 180),
        package: packageName,
        category: 'Electronic Component',
        basicPart: basic,
      })
    );
  }

  return parsed;
}

async function searchRemote(query: string, limit: number) {
  if (!query.trim()) {
    return [];
  }

  const url = `https://jlcpcb.com/parts/componentSearch?searchTxt=${encodeURIComponent(
    query
  )}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; modstract-bot/1.0)',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  return parseRemotePartsFromHtml(html, limit);
}

export async function GET(request: Request) {
  const { query, footprint, limit, source } = parseParams(request);

  if (source === 'remote') {
    try {
      const remoteParts = await searchRemote(query, limit);
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
