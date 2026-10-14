import type { Metadata } from 'next';

import { qrTtlSeconds } from '@/lib/repositories/qr';

import { QrScreen } from './QrScreen';

export const metadata: Metadata = { title: 'QR da recepção' };
export const dynamic = 'force-dynamic';

export default function QrPage() {
  return (
    <div>
      <header>
        <p className="eyebrow">Recepção</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">QR Code de presença</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Deixe esta tela aberta na entrada do tatame. O código troca a cada{' '}
          {qrTtlSeconds()} segundos — é isso que impede alguém de registrar presença de casa
          com uma foto do QR.
        </p>
      </header>

      <div className="mt-10">
        <QrScreen />
      </div>
    </div>
  );
}
