import { NextResponse } from 'next/server';

import { createPnpCsv } from '@/export/pnp';

type PnpRequest = {
  flattened: unknown;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PnpRequest;
    if (!body.flattened) {
      return NextResponse.json(
        { error: 'Missing flattened PCB payload' },
        { status: 400 }
      );
    }

    const csv = createPnpCsv(body.flattened as never);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pcb_pick_and_place.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to export Pick & Place',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
