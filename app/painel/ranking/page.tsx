import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MODALITY_IDS, MODALITY_LABELS, toModality, type ModalityId } from '@/data/seed';
import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { getRanking, getRankingPosition } from '@/lib/repositories/attendance';
import { getStudent, getStudents } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { saoPauloMonthString } from '@/utils/datetime';
import { shortName } from '@/utils/roster';

import { RankingBoard, type RankingEntry, type RankingSlice } from './RankingBoard';

export const metadata: Metadata = { title: 'Ranking' };
export const dynamic = 'force-dynamic';

const TOP = 10;

/** Os recortes da tela: o geral e um por modalidade. */
type Recorte = 'geral' | ModalityId;
const RECORTES: readonly Recorte[] = ['geral', ...MODALITY_IDS];

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
  const eu = perfil?.student ?? null;
  const euId = eu?.id ?? user.id;

  /*
   * Um ranking por modalidade, e não um só.
   *
   * No geral, quem treina jiu **e** MMA soma duas presenças por noite contra
   * uma de quem faz só jiu: o pódio passava a medir quantas modalidades a
   * pessoa faz, não com que constância ela aparece. Para o aluno de uma
   * modalidade só, o primeiro lugar ficava fora de alcance por aritmética — e
   * ranking que não dá para ganhar não é ranking.
   *
   * Aqui cada presença conta uma vez, na modalidade da aula em que ela
   * aconteceu. Quem faz as duas aparece nas duas listas, e em cada uma
   * compete de igual para igual.
   *
   * São oito leituras — quatro recortes vezes mês e geral —, todas em sorted
   * set, mais uma busca de fichas para os nomes. O custo é o de montar a tela
   * inteira de uma vez, em troca de a troca de aba não ir ao servidor.
   */
  const carregados = await Promise.all(
    RECORTES.map(async (recorte) => {
      const modality = recorte === 'geral' ? undefined : recorte;

      const [doMes, geral, posicaoMes, posicaoGeral] = await Promise.all([
        getRanking({ month, limit: TOP, ...(modality ? { modality } : {}) }),
        getRanking({ limit: TOP, ...(modality ? { modality } : {}) }),
        getRankingPosition(euId, { month, ...(modality ? { modality } : {}) }),
        getRankingPosition(euId, modality ? { modality } : {}),
      ]);

      return { recorte, doMes, geral, posicaoMes, posicaoGeral };
    }),
  );

  // Uma leitura de fichas para todas as listas.
  const ids = [
    ...new Set(
      carregados.flatMap((item) =>
        [...item.doMes, ...item.geral].map((row) => row.userId),
      ),
    ),
  ];
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
          isMe: row.userId === euId,
        };
      })
      .filter((entry): entry is RankingEntry => entry !== null)
      // Quem saiu da academia não deve deixar buraco na numeração.
      .map((entry, index) => ({ ...entry, position: index + 1 }));

  // `Object.fromEntries` devolve um índice aberto, e a asserção para
  // `Record<Recorte, …>` mentiria sobre as chaves existirem. Montar na mão é
  // mais longo e não mente.
  const slices: Record<string, RankingSlice> = {};
  for (const item of carregados) {
    slices[item.recorte] = {
      month: toEntries(item.doMes),
      overall: toEntries(item.geral),
      myMonth: item.posicaoMes,
      myOverall: item.posicaoGeral,
    };
  }

  /*
   * A aba que abre: a modalidade do próprio aluno.
   *
   * Abrir no geral mandaria justamente a pessoa que o recorte veio proteger —
   * a de uma modalidade só — para a lista em que ela não compete de igual
   * para igual. A escolha vem das turmas da ficha dele; havendo empate, a
   * primeira da ordem das modalidades resolve.
   */
  const grade = await getSchedule();
  const minhasModalidades = new Map<ModalityId, number>();

  for (const classId of eu?.classIds ?? []) {
    const modality = toModality(grade.classes.find((slot) => slot.id === classId)?.modality);
    if (modality) minhasModalidades.set(modality, (minhasModalidades.get(modality) ?? 0) + 1);
  }

  const principal =
    [...minhasModalidades.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <div>
      <header>
        <p className="eyebrow">Frequência</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Ranking</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Quem mais apareceu no tatame. Cada treino vale um ponto, e cada modalidade tem a sua
          lista — quem faz Jiu-Jitsu e MMA aparece nas duas, sem levar vantagem em nenhuma. O mês
          zera no dia 1º e o geral soma desde sempre.
        </p>
      </header>

      <RankingBoard
        slices={slices}
        tabs={RECORTES.map((recorte) => ({
          id: recorte,
          label: recorte === 'geral' ? 'Todas' : MODALITY_LABELS[recorte],
        }))}
        defaultTab={principal ?? 'geral'}
      />
    </div>
  );
}
