import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CheckinClient } from './CheckinClient';

export const metadata: Metadata = { title: 'Check-in' };
export const dynamic = 'force-dynamic';

export default function CheckinPage() {
  return (
    <div>
      <header className="mb-8 text-center">
        <p className="eyebrow">Presença</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Check-in</h1>
      </header>

      <Suspense
        fallback={
          <div className="surface-card mx-auto h-56 max-w-md animate-pulse" />
        }
      >
        <CheckinClient />
      </Suspense>
    </div>
  );
}
