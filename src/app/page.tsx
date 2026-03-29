'use client';

import * as React from 'react';
import '@/lib/env';

import ButtonLink from '@/components/links/ButtonLink';

export default function HomePage() {
  return (
    <main>
      <section className='bg-white'>
        <div className='layout relative flex min-h-screen flex-col items-center justify-center py-12 text-center'>
          <h1 className='text-4xl font-bold text-gray-900'>EZPCB</h1>
          <p className='mt-4 text-lg text-gray-600'>
            Design and prototype PCB layouts with drag-and-drop components
          </p>

          <ButtonLink className='mt-8' href='/pcb' variant='dark'>
            Open PCB Editor
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
