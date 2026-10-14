'use client';

import { useCallback, useRef, useState } from 'react';

import {
  GraduationDashboard,
  type KidsRow,
} from '@/components/admin/GraduationDashboard';
import type { AdultSummary } from '@/utils/graduationEngine';

/**
 * Casca client do preview: segura os callbacks que um Server Component nao
 * pode passar e mantem o estado otimista do "registrar / desfazer".
 *
 * O buffer de desfazer vive em um ref, nao em estado: ele nao participa da
 * renderizacao e, guardado assim, os updaters de `setKids` continuam puros -
 * o StrictMode os executa duas vezes e efeitos colaterais ali fariam a lista
 * ser alterada em dobro.
 *
 * Na rodada de integracao, estes handlers viram Server Actions que executam as
 * transacoes descritas em `docs/redis-schema.md`.
 */
export function GraduationPreview({
  initialKids,
  adults,
}: {
  readonly initialKids: readonly KidsRow[];
  readonly adults: readonly AdultSummary[];
}) {
  const [kids, setKids] = useState<readonly KidsRow[]>(initialKids);
  const undoBuffer = useRef(new Map<string, KidsRow>());

  const registerDegree = useCallback(
    (studentId: string) => {
      const target = kids.find((row) => row.student.id === studentId);
      if (!target) return;

      undoBuffer.current.set(studentId, target);
      setKids((current) => current.filter((row) => row.student.id !== studentId));
    },
    [kids],
  );

  const undoDegree = useCallback((studentId: string) => {
    const target = undoBuffer.current.get(studentId);
    if (!target) return;

    undoBuffer.current.delete(studentId);
    // O dashboard reordena por tempo de espera, entao a posicao aqui nao importa.
    setKids((current) => [target, ...current]);
  }, []);

  return (
    <GraduationDashboard
      kids={kids}
      adults={adults}
      onRegisterDegree={registerDegree}
      onUndoDegree={undoDegree}
    />
  );
}
