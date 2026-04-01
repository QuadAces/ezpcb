import { NextResponse } from 'next/server';

import { createBomCsv } from '@/export/bom';

import { FlattenedPcb } from '@/types/pcb';

type BomRequest = {
  flattened: FlattenedPcb;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BomRequest;
    if (!body.flattened) {
      return NextResponse.json(
        { error: 'Missing flattened PCB payload' },
        { status: 400 }
      );
    }

    const csv = createBomCsv(body.flattened);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pcb_bom.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to export BOM',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
