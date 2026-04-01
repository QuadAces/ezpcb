import { NextResponse } from 'next/server';

import { generateGerberZip } from '@/export/gerber';

type GerberRequest = {
  flattened: unknown;
  options?: {
    silkscreenStrokeMm?: number;
  };
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GerberRequest;
    if (!body.flattened) {
      return NextResponse.json(
        { error: 'Missing flattened PCB payload' },
        { status: 400 }
      );
    }

    const zipBuffer = await generateGerberZip(body.flattened as never, {
      silkscreenStrokeMm: body.options?.silkscreenStrokeMm,
    });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="pcb_gerber.zip"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to export Gerber',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
