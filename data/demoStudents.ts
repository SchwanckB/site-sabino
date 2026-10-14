/**
 * ===========================================================================
 * DADOS DE DEMONSTRACAO DO PAINEL DE GRADUACAO
 * ===========================================================================
 *
 * Alunos ficticios, usados apenas na rota de preview `/admin/graduacao`.
 * Nenhum dado real de aluno passa por aqui. Quando o painel for ligado ao
 * Redis (proxima rodada), este arquivo sai do caminho de producao.
 *
 * As datas sao geradas como deslocamentos a partir de `now` para que o preview
 * sempre tenha criancas elegiveis, independentemente de quando for aberto.
 * ===========================================================================
 */

import {
  toIsoDate,
  type AdultStudent,
  type KidsStudent,
} from '@/utils/graduationEngine';

const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` de N dias atras, no calendario de Sao Paulo. */
function daysAgo(now: Date, days: number): string {
  return toIsoDate(new Date(now.getTime() - days * MS_PER_DAY));
}

/** `YYYY-MM-DD` de N anos atras, preservando mes e dia. */
function yearsAgo(now: Date, years: number, month: number, day: number): string {
  const iso = toIsoDate(now);
  const year = Number(iso.slice(0, 4)) - years;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function buildDemoKids(now: Date): KidsStudent[] {
  return [
    // --- Elegiveis, tempos de espera diferentes ---------------------------
    {
      id: 'kid-01',
      name: 'Ana (exemplo)',
      birthDate: yearsAgo(now, 9, 4, 12),
      joinedAt: daysAgo(now, 400),
      lastGraduationAt: daysAgo(now, 96),
      degree: 3,
      belt: 'cinza',
    },
    {
      id: 'kid-02',
      name: 'Bruno (exemplo)',
      birthDate: yearsAgo(now, 11, 9, 2),
      joinedAt: daysAgo(now, 520),
      lastGraduationAt: daysAgo(now, 61),
      degree: 4, // proximo grau troca a tarja para vermelha
      belt: 'amarela',
    },
    {
      id: 'kid-03',
      name: 'Clara (exemplo)',
      birthDate: yearsAgo(now, 7, 1, 23),
      joinedAt: daysAgo(now, 150),
      lastGraduationAt: daysAgo(now, 44),
      degree: 8, // proximo grau troca a tarja para amarela
      belt: 'laranja',
    },
    {
      id: 'kid-04',
      name: 'Davi (exemplo)',
      birthDate: yearsAgo(now, 13, 6, 7),
      joinedAt: daysAgo(now, 90),
      lastGraduationAt: daysAgo(now, 31),
      degree: 10,
      belt: 'verde',
    },
    {
      id: 'kid-05',
      name: 'Eduarda (exemplo)',
      birthDate: yearsAgo(now, 6, 11, 19),
      joinedAt: daysAgo(now, 33),
      lastGraduationAt: null, // ancora cai no joinedAt
      degree: 0,
      belt: 'branca',
    },
    {
      id: 'kid-06',
      name: 'Felipe (exemplo)',
      birthDate: yearsAgo(now, 10, 3, 5),
      joinedAt: daysAgo(now, 300),
      lastGraduationAt: daysAgo(now, 30), // exatamente no limite
      degree: 6,
      belt: 'laranja',
    },
    {
      id: 'kid-07',
      name: 'Gabriela (exemplo)',
      birthDate: yearsAgo(now, 8, 8, 14),
      joinedAt: daysAgo(now, 210),
      lastGraduationAt: daysAgo(now, 120),
      degree: 1,
      belt: 'cinza',
    },

    // --- Nao elegiveis: entram no motor mas sao filtrados -----------------
    {
      id: 'kid-08',
      name: 'Heitor (exemplo)',
      birthDate: yearsAgo(now, 12, 2, 28),
      joinedAt: daysAgo(now, 180),
      lastGraduationAt: daysAgo(now, 12), // ainda aguardando
      degree: 5,
      belt: 'amarela',
    },
    {
      id: 'kid-09',
      name: 'Isabela (exemplo)',
      birthDate: yearsAgo(now, 14, 5, 30),
      joinedAt: daysAgo(now, 900),
      lastGraduationAt: daysAgo(now, 200),
      degree: 12, // PRONTO_PARA_AVALIACAO
      belt: 'verde',
    },
    {
      id: 'kid-10',
      name: 'Joao (exemplo)',
      birthDate: yearsAgo(now, 16, 7, 9),
      joinedAt: daysAgo(now, 1200),
      lastGraduationAt: daysAgo(now, 300),
      degree: 9, // MIGRAR_PARA_ADULTO
      belt: 'verde',
    },
  ];
}

export interface DemoAdult {
  readonly student: AdultStudent;
  readonly checkins: readonly string[];
}

/** Gera `count` check-ins espalhados nos ultimos `spanDays` dias. */
function spreadCheckins(now: Date, count: number, spanDays: number): string[] {
  const out: string[] = [];
  for (let index = 0; index < count; index++) {
    const offset = Math.round((index * spanDays) / Math.max(count, 1));
    out.push(daysAgo(now, offset));
  }
  return out;
}

export function buildDemoAdults(now: Date): DemoAdult[] {
  return [
    {
      student: {
        id: 'adult-01',
        name: 'Lucas (exemplo)',
        birthDate: yearsAgo(now, 31, 2, 14),
        joinedAt: daysAgo(now, 1800),
        lastGraduationAt: daysAgo(now, 420),
        belt: 'azul',
        degree: 2,
      },
      checkins: spreadCheckins(now, 164, 1800),
    },
    {
      student: {
        id: 'adult-02',
        name: 'Mariana (exemplo)',
        birthDate: yearsAgo(now, 27, 6, 3),
        joinedAt: daysAgo(now, 2600),
        lastGraduationAt: daysAgo(now, 980),
        belt: 'roxa',
        degree: 3,
      },
      checkins: spreadCheckins(now, 310, 2600),
    },
    {
      student: {
        id: 'adult-03',
        name: 'Nicolas (exemplo)',
        birthDate: yearsAgo(now, 22, 10, 21),
        joinedAt: daysAgo(now, 240),
        lastGraduationAt: null,
        belt: 'branca',
        degree: 4,
      },
      checkins: spreadCheckins(now, 58, 240),
    },
    {
      student: {
        id: 'adult-04',
        name: 'Otavio (exemplo)',
        birthDate: yearsAgo(now, 38, 4, 8),
        joinedAt: daysAgo(now, 4200),
        lastGraduationAt: daysAgo(now, 1500),
        belt: 'marrom',
        degree: 1,
      },
      // Afastado: nenhum check-in recente, aparece em vermelho na tabela.
      checkins: spreadCheckins(now, 402, 4200).filter(
        (iso) => iso <= daysAgo(now, 200),
      ),
    },
    {
      student: {
        id: 'adult-05',
        name: 'Paula (exemplo)',
        birthDate: yearsAgo(now, 45, 12, 1),
        joinedAt: daysAgo(now, 5600),
        lastGraduationAt: daysAgo(now, 2200),
        belt: 'preta',
        degree: 1,
      },
      checkins: spreadCheckins(now, 688, 5600),
    },
    {
      student: {
        id: 'adult-06',
        name: 'Rafael (exemplo)',
        birthDate: yearsAgo(now, 19, 3, 17),
        joinedAt: daysAgo(now, 610),
        lastGraduationAt: daysAgo(now, 150),
        belt: 'azul',
        degree: 0,
      },
      checkins: spreadCheckins(now, 97, 610),
    },
    {
      student: {
        id: 'adult-07',
        name: 'Sofia (exemplo)',
        birthDate: yearsAgo(now, 24, 8, 25),
        joinedAt: daysAgo(now, 95),
        lastGraduationAt: null,
        belt: 'branca',
        degree: 1,
      },
      checkins: spreadCheckins(now, 31, 95),
    },
  ];
}
