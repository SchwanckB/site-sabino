import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MODALITY_IDS, MODALITY_LABELS, toModality, type ModalityId } from '@/data/seed';
import { UNIT_LABELS } from '@/types/domain';
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

/**
 * Os recortes da tela.
 *
 * `geral` é a academia inteira, as modalidades são as turmas, e `feminino`
 * é o recorte das alunas — todas elas, em tudo o que treinam, e não a turma
 * feminina de terça e quinta. Ver `lib/redis.ts`.
 */
type Recorte = 'geral' | 'feminino' | ModalityId;
const RECORTES: readonly Recorte[] = ['geral', ...MODALITY_IDS, 'feminino'];

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
   * O ranking é o da academia dele.
   *
   * São duas unidades com grades e tamanhos diferentes, e disputar pódio com
   * quem treina a meia hora de distância não diz nada a ninguém. A unidade sai
   * da ficha: é onde o aluno é de casa, mesmo nas noites em que ele visita a
   * outra.
   */
  const unit = eu?.unit ?? null;

  /*
   * Sem ficha não há academia, e sem academia não há ranking.
   *
   * O layout do painel já barra quem não tem perfil ativo, então na prática
   * isto não acontece. Fica porque a alternativa era pedir o ranking sem
   * unidade — e aí o recorte por modalidade não existe como chave, o que
   * agora falha alto em vez de devolver o geral em silêncio.
   */
  if (!eu || !unit) {
    return (
      <div>
        <header>
          <p className="eyebrow">Frequência</p>
          <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Ranking</h1>
        </header>
        <div className="panel mt-8 px-6 py-14 text-center">
          <p className="font-display text-lg uppercase tracking-tight">Ranking indisponível</p>
          <p className="mt-2 text-sm text-muted">
            Assim que a recepção aprovar seu cadastro e definir sua academia, o ranking aparece
            aqui.
          </p>
        </div>
      </div>
    );
  }

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
      const modality =
        recorte === 'geral' || recorte === 'feminino' ? undefined : recorte;

      const recorteBase = {
        unit,
        ...(modality ? { modality } : {}),
        ...(recorte === 'feminino' ? { feminino: true } : {}),
      };

      const [doMes, geral, posicaoMes, posicaoGeral] = await Promise.all([
        getRanking({ ...recorteBase, month, limit: TOP }),
        getRanking({ ...recorteBase, limit: TOP }),
        getRankingPosition(euId, { ...recorteBase, month }),
        getRankingPosition(euId, recorteBase),
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
   * As modalidades **dele**, lidas das turmas da ficha.
   *
   * São elas que a tela mostra. Oferecer as quatro listas a quem treina só
   * Jiu-Jitsu é devolver o problema que o recorte veio resolver: três abas em
   * que ele não compete, e a dele perdida no meio. As outras continuam a um
   * toque, no botão de ver todas — quem quer espiar o MMA, espia.
   *
   * A contagem ordena: a modalidade com mais turmas na ficha é a principal, e
   * é nela que a tela abre.
   */
  const grade = await getSchedule();
  const minhasModalidades = new Map<ModalityId, number>();

  for (const classId of eu.classIds) {
    const modality = toModality(grade.classes.find((slot) => slot.id === classId)?.modality);
    if (modality) minhasModalidades.set(modality, (minhasModalidades.get(modality) ?? 0) + 1);
  }

  const minhas: Recorte[] = [...minhasModalidades.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([modality]) => modality);

  const principal = minhas[0] ?? null;

  /*
   * A aba feminina é das alunas.
   *
   * Entra junto com as modalidades delas, e não como a principal: o pódio que
   * diz mais à aluna é o da turma em que ela treina, contra quem treina o
   * mesmo. O feminino é o recorte a mais, não o lugar dela.
   *
   * Quem não informou o sexo não entra — nem na lista, nem com a aba. É o
   * único tratamento honesto para um campo deixado em branco de propósito.
   */
  if (eu.gender === 'feminino') minhas.push('feminino');

  return (
    <div>
      <header>
        <p className="eyebrow">Frequência</p>
        <h1 className="mt-2 text-3xl leading-none sm:text-4xl">Ranking</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Quem mais apareceu no tatame em {UNIT_LABELS[unit]}. Cada treino vale um ponto, e cada
          modalidade tem a sua lista — quem faz Jiu-Jitsu e MMA aparece nas duas, sem levar
          vantagem em nenhuma. O mês zera no dia 1º e o geral soma desde sempre.
        </p>
      </header>

      <RankingBoard
        slices={slices}
        tabs={RECORTES.map((recorte) => ({
          id: recorte,
          label:
            recorte === 'geral'
              ? 'Todas'
              : recorte === 'feminino'
                ? 'Feminino'
                : MODALITY_LABELS[recorte],
        }))}
        mine={minhas}
        defaultTab={principal ?? 'geral'}
      />
    </div>
  );
}
