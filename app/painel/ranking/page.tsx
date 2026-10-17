import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';
import { getRanking, getRankingPosition } from '@/lib/repositories/attendance';
import { getStudents } from '@/lib/repositories/students';
import { saoPauloMonthString } from '@/utils/datetime';
import { shortName } from '@/utils/roster';

import { RankingBoard, type RankingEntry } from './RankingBoard';

export const metadata: Metadata = { title: 'Ranking' };
export const dynamic = 'force-dynamic';

const TOP = 10;

export default async function RankingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const now = new Date();
  const month = saoPauloMonthString(now);

  const [doMes, geral, posicaoMes, posicaoGeral] = await Promise.all([
    getRanking({ month, limit: TOP }),
    getRanking({ limit: TOP }),
    getRankingPosition(user.id, { month }),
    getRankingPosition(user.id),
  ]);

  // Uma leitura só para os dois recortes.
  const ids = [...new Set([...doMes, ...geral].map((row) => row.userId))];
  const students = await getStudents(ids);
  const byId = new Map(students.map((student) => [student.id, student]));

  const toEntries = (rows: readonly { userId: string; score: number; position: number }[]) =>
    rows
      .map((row): RankingEntry | null => {
        const student = byId.get(row.userId);
        if (!student || student.status !== 'ativo') return null;

        return {
          position: row.position,
          // Nome curto: a tela é visível para os colegas.
          name: shortName(student.name),
          belt: student.belt,
          score: row.score,
          isMe: row.userId === user.id,
        };
      })
      .filter((entry): entry is RankingEntry => entry !== null)
      // Quem saiu da academia não deve deixar buraco na numeração.
      .map((entry, index) => ({ ...entry, position: index + 1 }));

  return (
    <div>
      <header>
        <p className="eyebrow">Frequência</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Ranking</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Quem mais apareceu no tatame. Cada check-in vale um ponto — o mês zera no dia 1º e o
          geral soma desde sempre.
        </p>
      </header>

      <RankingBoard
        month={toEntries(doMes)}
        overall={toEntries(geral)}
        myMonth={posicaoMes}
        myOverall={posicaoGeral}
      />
    </div>
  );
}
