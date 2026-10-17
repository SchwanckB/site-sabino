'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '@/lib/auth';
import { recordCheckin } from '@/lib/repositories/attendance';
import { validateQrToken } from '@/lib/repositories/qr';
import { getStudent } from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import type { CheckinResult } from '@/types/domain';

/**
 * Check-in do aluno pelo QR Code da recepção.
 *
 * A ordem das checagens importa: o token é validado **antes** de qualquer
 * gravação, e a regra "uma presença por dia" é garantida pelo `SET NX` dentro
 * de `recordCheckin`, não por uma leitura prévia — duas tentativas simultâneas
 * não conseguem passar as duas.
 */
export async function checkinAction(token: string): Promise<CheckinResult> {
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

  const clean = token.trim();
  if (clean.length === 0) {
    return { ok: false, reason: 'qr_invalido', message: 'Código inválido.' };
  }

  const validation = await validateQrToken(clean, student.id);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      message:
        validation.reason === 'qr_expirado'
          ? 'Este código já expirou. Leia o QR que está na tela da recepção agora.'
          : 'Código inválido. Use o QR da recepção.',
    };
  }

  const now = new Date();
  const schedule = await getSchedule();

  // A turma vem do próprio QR, não da janela de horário: cada turma tem o
  // seu código, e isso tira a ambiguidade de dois horários encostados.
  const current = schedule.classes.find((slot) => slot.id === validation.classId) ?? null;

  if (!current) {
    return {
      ok: false,
      reason: 'erro',
      message: 'Este QR é de uma turma que não existe mais. Chame o professor.',
    };
  }

  if (!student.classIds.includes(current.id)) {
    return {
      ok: false,
      reason: 'sem_aula_agora',
      message: `Você não está matriculado em ${current.title}. Fale com o professor.`,
    };
  }

  const result = await recordCheckin(
    {
      student,
      classId: current.id,
      classTitle: current.title,
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

  return { ok: true, classTitle: current.title, at: result.entry.at };
}
