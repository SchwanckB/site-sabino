import 'server-only';

import type { ProfileCardData } from '@/components/app/ProfileCard';
import { listCheckins } from '@/lib/repositories/attendance';
import type { SocialProfile } from '@/lib/repositories/profiles';
import type { StudentRecord } from '@/types/domain';
import { summarizeStreak } from '@/utils/attendanceStreak';
import { daysBetween, saoPauloDateString } from '@/utils/datetime';
import { formatSpan } from '@/utils/graduationTimeline';

/**
 * Monta o cartão de perfil a partir da ficha e do histórico.
 *
 * Vive num módulo só porque três telas o desenham — a comunidade, o perfil de
 * alguém e a prévia da própria edição — e um deles divergir dos outros é
 * exatamente o bug que um aluno descobre depois de publicar: ele aprova uma
 * prévia e os colegas veem outra coisa.
 *
 * O que entra foi escolhido a dedo: faixa, graus, tempo de casa, frequência e
 * sequência. O que **não** entra, e não deve voltar a entrar, são as turmas
 * que a pessoa faz e o próximo treino dela. Juntos, esses dois dizem a
 * qualquer colega onde aquele aluno vai estar e a que hora — e boa parte da
 * base é de menores de idade.
 */
export async function buildProfileCard(
  student: StudentRecord,
  profile: SocialProfile | null,
  now: Date,
  rankPosition: number | null = null,
): Promise<ProfileCardData> {
  // 400 check-ins cobrem mais de três anos de treino três vezes por semana; é
  // o suficiente para a sequência e a conta do mês, e barato de ler.
  const checkins = await listCheckins(student.id, 400);
  const today = saoPauloDateString(now);

  const streak = summarizeStreak(
    checkins.map((entry) => entry.date),
    today,
  );

  const inicio = student.joinedAt ?? student.createdAt;
  const dias = inicio.length >= 10 ? daysBetween(today, inicio.slice(0, 10)) : -1;

  return {
    studentId: student.id,
    name: student.name,
    belt: student.belt,
    degree: student.degree,
    isKids: student.category === 'kids',
    bio: profile?.bio ?? '',
    hasAvatar: Boolean(profile?.avatarKey),
    hasBanner: Boolean(profile?.bannerKey),
    since: dias >= 0 ? formatSpan(dias) : null,
    /*
     * O total vem da lista lida, e não de `countCheckins`.
     *
     * Para quem passar das 400 presenças o número fica travado no teto, e
     * isso é melhor que uma segunda ida ao banco em cada linha da lista da
     * comunidade. Se um dia alguém chegar lá, é um problema bom de ter.
     */
    totalCheckins: checkins.length,
    monthCheckins: checkins.filter((entry) => entry.date.startsWith(today.slice(0, 7))).length,
    streakWeeks: streak.weeks,
    rankPosition,
  };
}
