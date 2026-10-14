'use client';

import { useCallback, useRef, useState, useTransition } from 'react';

import {
  GraduationDashboard,
  type KidsRow,
} from '@/components/admin/GraduationDashboard';
import type { AdultSummary } from '@/utils/graduationEngine';

import { registerDegreeAction, undoDegreeAction } from '../actions';

/**
 * Liga o dashboard (apresentação pura) às Server Actions.
 *
 * A linha some da lista assim que o admin confirma — resposta imediata no
 * tatame — e é restaurada se a gravação falhar, para a tela nunca mentir sobre
 * o que o banco tem.
 */
export function GraduationClient({
  initialKids,
  adults,
}: {
  readonly initialKids: readonly KidsRow[];
  readonly adults: readonly AdultSummary[];
}) {
  const [kids, setKids] = useState<readonly KidsRow[]>(initialKids);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const undoBuffer = useRef(new Map<string, KidsRow>());

  const restore = useCallback((row: KidsRow) => {
    setKids((current) =>
      current.some((item) => item.student.id === row.student.id) ? current : [row, ...current],
    );
  }, []);

  const registerDegree = useCallback(
    (studentId: string) => {
      const target = kids.find((row) => row.student.id === studentId);
      if (!target) return;

      undoBuffer.current.set(studentId, target);
      setKids((current) => current.filter((row) => row.student.id !== studentId));
      setError(null);

      startTransition(async () => {
        const form = new FormData();
        form.set('studentId', studentId);
        const result = await registerDegreeAction(form);

        if (!result.ok) {
          setError(result.message);
          restore(target);
          undoBuffer.current.delete(studentId);
        }
      });
    },
    [kids, restore],
  );

  const undoDegree = useCallback(
    (studentId: string) => {
      const target = undoBuffer.current.get(studentId);
      undoBuffer.current.delete(studentId);
      setError(null);

      startTransition(async () => {
        const form = new FormData();
        form.set('studentId', studentId);
        const result = await undoDegreeAction(form);

        if (result.ok && target) {
          restore(target);
        } else if (!result.ok) {
          setError(result.message);
        }
      });
    },
    [restore],
  );

  return (
    <GraduationDashboard
      kids={kids}
      adults={adults}
      error={error}
      onRegisterDegree={registerDegree}
      onUndoDegree={undoDegree}
    />
  );
}
