import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { getRanking, getRankingPosition } from '@/lib/repositories/attendance';
import { getStudent, getStudents } from '@/lib/repositories/students';
import { saoPauloMonthString } from '@/utils/datetime';
import { rankByScoreThenSeniority } from '@/utils/ranking';
import { shortName } from '@/utils/roster';

import { RankingBoard, type RankingEntry } from './RankingBoard';

export const metadata: Metadata = { title: 'Ranking' };
export const dynamic = 'force-dynamic';

const TOP = 10;

/*
 * Quantos a página lê do Redis antes de desempatar.
 *
 * O desempate por ordem de cadastro não pode ser feito só sobre os dez
 * primeiros: se o décimo e o décimo-primeiro empatam em pontos, quem entra no
 * pódio é decidido **antes** de a regra rodar, e aí ela não serve para nada.
 * Lendo uma janela larga, ordenando e só então cortando, o corte acontece
 * depois da regra.
 *
 * Quinhentos cobre com folga uma academia de duas unidades — e quem está além
 * disso não disputa as dez primeiras posições de jeito nenhum.
 */
const JANELA = 500;

export default async function RankingPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const now = new Date();
  const month = saoPauloMonthString(now);

  /*
   * "Minha posição" é a do perfil ativo, não a de quem logou.
   *
   * O pai que troca para o perfil do filho vinha vendo a própria colocação
   * destacada na lista — e o filho, que talvez esteja em segundo lugar, sem
   * destaque nenhum. Quem abre o ranking pelo perfil da criança quer ver a
   * criança.
   */
  const perfil = await resolveActiveProfile(user.id, await getStudent(user.id));
  const euId = perfil?.student.id ?? user.id;

  const [doMes, geral, posicaoMesRedis, posicaoGeralRedis] = await Promise.all([
    getRanking({ month, limit: JANELA }),
    getRanking({ limit: JANELA }),
    getRankingPosition(euId, { month }),
    getRankingPosition(euId),
  ]);

  // Uma leitura só para os dois recortes.
  const ids = [...new Set([...doMes, ...geral].map((row) => row.userId))];
  const students = await getStudents(ids);
  const byId = new Map(students.map((student) => [student.id, student]));

  const cadastradoEm = (userId: string): string | null =>
    byId.get(userId)?.createdAt ?? null;

  /**
   * Da leitura crua do Redis para as linhas da tela.
   *
   * A ordem do Redis é descartada: com pontuação empatada ele entrega pelo id
   * do membro, e a regra da academia é a ordem de cadastro. Quem saiu some
   * antes da numeração, para não deixar buraco na contagem.
   */
  const ordenar = (rows: readonly { userId: string; score: number }[]) =>
    rankByScoreThenSeniority(
      rows.filter((row) => byId.get(row.userId)?.status === 'ativo'),
      cadastradoEm,
    );

  const toEntries = (rows: readonly { userId: string; score: number }[]): RankingEntry[] =>
    ordenar(rows)
      .slice(0, TOP)
      .map(({ entry, position }): RankingEntry => {
        const student = byId.get(entry.userId);

        return {
          position,
          // Nome curto: a tela é visível para os colegas.
          name: shortName(student?.name ?? ''),
          belt: student?.belt ?? '',
          score: entry.score,
          isMe: entry.userId === euId,
        };
      });

  /*
   * "Minha posição" tem de sair da mesma ordenação do quadro.
   *
   * Vinha do `zrevrank` do Redis, que não conhece a regra de desempate: um
   * aluno empatado podia ler "você está em 4º" embaixo de um quadro que o
   * mostrava em 3º. Dentro da janela, a posição é a da lista ordenada; fora
   * dela, o número do Redis serve — lá o empate não decide pódio.
   */
  const minhaPosicao = (
    rows: readonly { userId: string; score: number }[],
    doRedis: { position: number; score: number } | null,
  ): { position: number; score: number } | null => {
    const encontrado = ordenar(rows).find(({ entry }) => entry.userId === euId);
    if (encontrado) {
      return { position: encontrado.position, score: encontrado.entry.score };
    }
    return doRedis;
  };

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
        myMonth={minhaPosicao(doMes, posicaoMesRedis)}
        myOverall={minhaPosicao(geral, posicaoGeralRedis)}
      />
    </div>
  );
}
