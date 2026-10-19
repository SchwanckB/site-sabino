'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { recordCheckin } from '@/lib/repositories/attendance';
import { validateQrToken } from '@/lib/repositories/qr';
import { getStudent } from '@/lib/repositories/students';
import { getScheduleFresh } from '@/lib/schedule';
import type { CheckinResult } from '@/types/domain';
import { findOpenClasses } from '@/utils/attendanceEngine';

/**
 * Check-in do aluno.
 *
 * O QR da parede identifica a **academia**, não a turma — é um cartaz só por
 * unidade. Quem escolhe a aula é o aluno, entre as turmas dele que estão
 * acontecendo naquele momento. Quando só há uma, a tela registra sozinha e
 * ele não escolhe nada.
 *
 * A grade é lida sem cache. `getSchedule()` guarda por uma hora para a
 * landing, e aqui ela não é conteúdo: é a regra que decide se a presença
 * entra. Uma grade de uma hora atrás recusaria o aluno da turma que o
 * professor acabou de criar — ou aceitaria na que ele acabou de apagar.
 *
 * A ordem das checagens importa: o código é resolvido **antes** de qualquer
 * gravação, e a regra "uma presença por dia" é garantida pelo `SET NX` dentro
 * de `recordCheckin`, não por uma leitura prévia — duas tentativas
 * simultâneas não conseguem passar as duas.
 */

export interface OpenClassOption {
  readonly classId: string;
  readonly title: string;
  readonly level: string;
  readonly time: string;
}

export type CheckinOptions =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly classes: readonly OpenClassOption[] };

/**
 * Turmas do aluno abertas agora, na academia do cartaz lido.
 *
 * Fica separado do registro porque a tela precisa perguntar antes de gravar
 * quando há mais de uma aula no mesmo horário.
 */
export async function listCheckinOptions(token: string): Promise<CheckinOptions> {
  const user = await requireUser();

  const student = await getStudent(user.id);
  if (!student) return { ok: false, message: 'Cadastro não encontrado.' };
  if (student.status !== 'ativo') {
    return { ok: false, message: 'Sua matrícula não está ativa. Fale com a recepção.' };
  }

  const validation = validateQrToken(token);
  if (!validation.ok) {
    return { ok: false, message: 'Código inválido. Use o QR da academia.' };
  }

  if (validation.unit !== student.unit) {
    return {
      ok: false,
      message: 'Este QR é de outra unidade. Use o cartaz da academia onde você treina.',
    };
  }

  const schedule = await getScheduleFresh();
  const abertas = findOpenClasses(schedule.classes, student.classIds, new Date());

  return {
    ok: true,
    classes: abertas.map((slot) => ({
      classId: slot.classId,
      title: slot.title,
      level: slot.level ?? '',
      time: slot.startTime,
    })),
  };
}

/** Registra a presença na turma escolhida pelo aluno. */
export async function checkinAction(token: string, classId: string): Promise<CheckinResult> {
  const user = await requireUser();

  const student = await getStudent(user.id);
  if (!student) {
    return { ok: false, reason: 'erro', message: 'Cadastro não encontrado.' };
  }
  if (student.status !== 'ativo') {
    return {
      ok: false,
      reason: 'aluno_inativo',
      message: 'Sua matrícula não está ativa. Fale com a recepção.',
    };
  }

  const validation = validateQrToken(token);
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'qr_invalido',
      message: 'Código inválido. Use o QR da academia.',
    };
  }

  if (validation.unit !== student.unit) {
    return {
      ok: false,
      reason: 'qr_invalido',
      message: 'Este QR é de outra unidade. Use o cartaz da academia onde você treina.',
    };
  }

  const now = new Date();
  const schedule = await getScheduleFresh();

  /*
   * A turma escolhida é reconferida contra as que estão abertas agora.
   *
   * O cliente manda o id, e cliente não é fonte de verdade: sem esta linha,
   * bastaria trocar o valor no formulário para marcar presença numa aula de
   * outro dia. É aqui que a janela de horário e a matrícula são impostas.
   */
  const abertas = findOpenClasses(schedule.classes, student.classIds, now);
  const escolhida = abertas.find((slot) => slot.classId === classId) ?? null;

  if (!escolhida) {
    return {
      ok: false,
      reason: 'sem_aula_agora',
      message:
        abertas.length === 0
          ? 'Nenhuma das suas turmas está acontecendo agora. O check-in vale no horário do treino.'
          : 'Escolha uma das turmas que estão acontecendo agora.',
    };
  }

  const result = await recordCheckin(
    {
      student,
      classId: escolhida.classId,
      classTitle: escolhida.title,
      source: 'qr',
      registeredBy: student.id,
    },
    now,
  );

  if (!result.ok) {
    return result.reason === 'ja_registrado'
      ? {
          ok: false,
          reason: 'ja_registrado',
          message: 'Você já registrou presença hoje.',
        }
      : {
          ok: false,
          reason: 'erro',
          message: 'Não foi possível registrar agora. Chame a recepção.',
        };
  }

  revalidatePath('/painel');
  revalidatePath('/admin/presenca');
  revalidatePath('/admin/aula');

  return { ok: true, classTitle: escolhida.title, at: result.entry.at };
}
