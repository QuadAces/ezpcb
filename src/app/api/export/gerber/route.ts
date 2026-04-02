import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateGerberZip } from '@/export/gerber';

const gerberRequestSchema = z.object({
  flattened: z.unknown(),
  options: z
    .object({
      silkscreenStrokeMm: z.number().finite().optional(),
    })
    .optional(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const parsedBody = gerberRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid Gerber export payload' },
        { status: 400 }
      );
    }

    const zipBuffer = await generateGerberZip(
      parsedBody.data.flattened as never,
      {
        silkscreenStrokeMm: parsedBody.data.options?.silkscreenStrokeMm,
      }
    );

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
