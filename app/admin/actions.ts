'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin, type Role } from '@/lib/auth';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { setAccountRole } from '@/lib/repositories/accounts';
import { recordCheckin, undoCheckin } from '@/lib/repositories/attendance';
import { removeEvent, upsertEvent } from '@/lib/repositories/calendar';
import { registerDegree, promoteBelt, undoLastDegree } from '@/lib/repositories/graduation';
import {
  getPaymentPlan,
  registerPayment,
  setupPaymentPlan,
  undoLastPayment,
} from '@/lib/repositories/payments';
import { removePlan, resetPlansToSeed, upsertPlan } from '@/lib/repositories/plansAdmin';
import { saveAcademySettings } from '@/lib/repositories/settings';
import { removeClass, resetScheduleToSeed, upsertClass } from '@/lib/repositories/scheduleAdmin';
import {
  approveStudent,
  getStudent,
  rejectStudent,
  setStudentStatus,
  updateStudent,
} from '@/lib/repositories/students';
import { getSchedule } from '@/lib/schedule';
import { setUnitScope } from '@/lib/unitScope';
import {
  GENDERS,
  PAYMENT_METHODS,
  USER_STATUSES,
  toUnitId,
  toUnitScope,
  type Gender,
  type PaymentMethod,
  type UserStatus,
} from '@/types/domain';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { saoPauloDateString } from '@/utils/datetime';
import { DEFAULT_GRACE_DAYS, parseCentsInput, type PlanId } from '@/utils/paymentEngine';

/**
 * Ações do administrador.
 *
 * **Toda** ação começa por `requireAdmin()`. Server Actions são endpoints HTTP
 * públicos: sem essa checagem, qualquer pessoa com o ID da action poderia
 * aprovar matrículas ou quitar mensalidades.
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

const PLAN_IDS: readonly PlanId[] = ['mensal', 'trimestral', 'anual'];

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function refreshAdmin(): void {
  revalidatePath('/admin', 'layout');
}

/* -------------------------------------------------------------------------- */
/* Aprovação de cadastro                                                      */
/* -------------------------------------------------------------------------- */

export async function approveStudentAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const studentId = text(form, 'studentId');
  const student = await getStudent(studentId);
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const classIds = form.getAll('classIds').filter((v): v is string => typeof v === 'string');
  const belt = text(form, 'belt') || 'branca';
  const degree = Number(text(form, 'degree')) || 0;
  const notes = text(form, 'notes');

  const planId = text(form, 'planId');
  const amountCents = parseCentsInput(text(form, 'amount'));
  const dueDay = Number(text(form, 'dueDay'));
  const graceDays = Number(text(form, 'graceDays'));

  if (!(PLAN_IDS as readonly string[]).includes(planId)) {
    return { ok: false, message: 'Selecione o tipo de mensalidade.' };
  }
  if (amountCents === null) {
    return { ok: false, message: 'Informe o valor da mensalidade.' };
  }
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
    return { ok: false, message: 'Informe o dia do vencimento (1 a 31).' };
  }

  const now = new Date();

  try {
    await approveStudent(student, { classIds, belt, degree, notes }, now);
    await setupPaymentPlan(
      {
        userId: student.id,
        planId: planId as PlanId,
        amountCents,
        dueDay,
        graceDays: Number.isFinite(graceDays) ? graceDays : DEFAULT_GRACE_DAYS,
        firstDueDate: text(form, 'firstDueDate'),
      },
      now,
    );
  } catch (error) {
    console.error('[admin] falha ao aprovar', error);
    return { ok: false, message: 'Não foi possível aprovar. Tente novamente.' };
  }

  void admin;
  refreshAdmin();
  return { ok: true, message: `${student.name} foi aprovado.` };
}

export async function rejectStudentAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const reason = text(form, 'reason');
  if (reason.length < 3) {
    return { ok: false, message: 'Explique o motivo da recusa para o aluno.' };
  }

  await rejectStudent(student, reason, new Date());
  refreshAdmin();
  return { ok: true, message: `Cadastro de ${student.name} recusado.` };
}

export async function setStatusAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const next = text(form, 'status');
  if (!(USER_STATUSES as readonly string[]).includes(next)) {
    return { ok: false, message: 'Status inválido.' };
  }

  await setStudentStatus(student, next as UserStatus, new Date());
  refreshAdmin();
  return { ok: true, message: 'Status atualizado.' };
}

/** Altera turmas, faixa, graus e observações de um aluno já ativo. */
export async function updateStudentAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const classIds = form.getAll('classIds').filter((v): v is string => typeof v === 'string');
  const belt = text(form, 'belt') || student.belt;
  const degreeRaw = Number(text(form, 'degree'));
  const degree = Number.isFinite(degreeRaw) ? Math.max(0, Math.trunc(degreeRaw)) : student.degree;

  const genderInput = text(form, 'gender');
  const gender: Gender = (GENDERS as readonly string[]).includes(genderInput)
    ? (genderInput as Gender)
    : student.gender;

  const unit = toUnitId(text(form, 'unit'));

  await updateStudent(
    student.id,
    { classIds, belt, degree, gender, unit, notes: text(form, 'notes') },
    new Date(),
  );

  refreshAdmin();
  return { ok: true, message: 'Dados atualizados.' };
}

/* -------------------------------------------------------------------------- */
/* Financeiro                                                                 */
/* -------------------------------------------------------------------------- */

export async function registerPaymentAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const studentId = text(form, 'studentId');
  const plan = await getPaymentPlan(studentId);
  if (!plan) return { ok: false, message: 'Este aluno ainda não tem mensalidade definida.' };

  const method = text(form, 'method') || 'pix';
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { ok: false, message: 'Forma de pagamento inválida.' };
  }

  const amountOverride = parseCentsInput(text(form, 'amount'));

  await registerPayment(
    plan,
    {
      method: method as PaymentMethod,
      amountCents: amountOverride ?? plan.amountCents,
      registeredBy: admin.id,
    },
    new Date(),
  );

  refreshAdmin();
  return { ok: true, message: 'Pagamento registrado.' };
}

export async function undoPaymentAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const plan = await getPaymentPlan(text(form, 'studentId'));
  if (!plan) return { ok: false, message: 'Mensalidade não encontrada.' };

  await undoLastPayment(plan, new Date());
  refreshAdmin();
  return { ok: true, message: 'Último pagamento desfeito.' };
}

export async function updatePlanAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const studentId = text(form, 'studentId');
  const planId = text(form, 'planId');
  const amountCents = parseCentsInput(text(form, 'amount'));
  const dueDay = Number(text(form, 'dueDay'));
  const graceDays = Number(text(form, 'graceDays'));

  if (!(PLAN_IDS as readonly string[]).includes(planId)) {
    return { ok: false, message: 'Tipo de mensalidade inválido.' };
  }
  if (amountCents === null) {
    return { ok: false, message: 'Informe o valor da mensalidade.' };
  }
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
    return { ok: false, message: 'Informe o dia do vencimento (1 a 31).' };
  }

  await setupPaymentPlan(
    {
      userId: studentId,
      planId: planId as PlanId,
      amountCents,
      dueDay,
      graceDays: Number.isFinite(graceDays) ? graceDays : DEFAULT_GRACE_DAYS,
      firstDueDate: text(form, 'dueDate'),
    },
    new Date(),
  );

  refreshAdmin();
  return { ok: true, message: 'Mensalidade atualizada.' };
}

/* -------------------------------------------------------------------------- */
/* Presença manual — individual e em lote                                     */
/* -------------------------------------------------------------------------- */

async function markPresent(
  studentId: string,
  adminId: string,
  source: 'manual' | 'lote',
  now: Date,
): Promise<'ok' | 'ja_registrado' | 'nao_encontrado' | 'inativo'> {
  const student = await getStudent(studentId);
  if (!student) return 'nao_encontrado';
  if (student.status !== 'ativo') return 'inativo';

  // A aula é inferida pelo horário: se houver turma do aluno acontecendo
  // agora, a presença fica vinculada a ela.
  const schedule = await getSchedule();
  const open = findOpenClasses(schedule.classes, student.classIds, now);
  const current = open[0] ?? null;

  const result = await recordCheckin(
    {
      student,
      classId: current?.classId ?? null,
      classTitle: current?.title ?? null,
      source,
      registeredBy: adminId,
    },
    now,
  );

  return result.ok ? 'ok' : 'ja_registrado';
}

export async function markPresenceAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const outcome = await markPresent(text(form, 'studentId'), admin.id, 'manual', new Date());

  refreshAdmin();
  switch (outcome) {
    case 'ok':
      return { ok: true, message: 'Presença registrada.' };
    case 'ja_registrado':
      return { ok: false, message: 'Este aluno já tem presença hoje.' };
    case 'inativo':
      return { ok: false, message: 'Aluno não está ativo.' };
    default:
      return { ok: false, message: 'Aluno não encontrado.' };
  }
}

/** Marca vários alunos de uma vez, a partir da seleção na lista. */
export async function markPresenceBatchAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const ids = form.getAll('studentIds').filter((v): v is string => typeof v === 'string');
  if (ids.length === 0) {
    return { ok: false, message: 'Selecione pelo menos um aluno.' };
  }

  const now = new Date();
  let registered = 0;
  let already = 0;
  let skipped = 0;

  for (const id of ids) {
    const outcome = await markPresent(id, admin.id, 'lote', now);
    if (outcome === 'ok') registered += 1;
    else if (outcome === 'ja_registrado') already += 1;
    else skipped += 1;
  }

  refreshAdmin();

  const parts = [`${registered} presença${registered === 1 ? '' : 's'} registrada${registered === 1 ? '' : 's'}`];
  if (already > 0) parts.push(`${already} já tinha presença hoje`);
  if (skipped > 0) parts.push(`${skipped} ignorado${skipped === 1 ? '' : 's'}`);

  return { ok: registered > 0, message: `${parts.join(', ')}.` };
}

export async function undoPresenceAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const now = new Date();
  const date = text(form, 'date') || saoPauloDateString(now);
  const removed = await undoCheckin(student, date, now);

  refreshAdmin();
  return removed
    ? { ok: true, message: 'Presença removida.' }
    : { ok: false, message: 'Não havia presença neste dia.' };
}

/* -------------------------------------------------------------------------- */
/* Graduação                                                                  */
/* -------------------------------------------------------------------------- */

export async function registerDegreeAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const result = await registerDegree(student, admin.id, new Date());

  refreshAdmin();
  return result.ok
    ? { ok: true, message: `Grau ${result.degree} registrado para ${student.name}.` }
    : { ok: false, message: 'Este aluno já completou os 12 graus.' };
}

export async function undoDegreeAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const result = await undoLastDegree(student, new Date());

  refreshAdmin();
  return result.ok
    ? { ok: true, message: 'Graduação desfeita.' }
    : { ok: false, message: 'Não há graduação para desfazer.' };
}

export async function promoteBeltAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const toBelt = text(form, 'belt');
  if (toBelt.length === 0) return { ok: false, message: 'Selecione a nova faixa.' };

  await promoteBelt(student, toBelt, admin.id, text(form, 'note'), new Date());

  refreshAdmin();
  return { ok: true, message: `${student.name} agora é faixa ${toBelt}.` };
}

/* -------------------------------------------------------------------------- */
/* Grade de horários                                                          */
/* -------------------------------------------------------------------------- */

export async function saveClassAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const result = await upsertClass(
    {
      id: text(form, 'id') || undefined,
      weekday: Number(text(form, 'weekday')),
      startTime: text(form, 'startTime'),
      endTime: text(form, 'endTime'),
      title: text(form, 'title'),
      modality: text(form, 'modality'),
      level: text(form, 'level'),
      unit: text(form, 'unit'),
    },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  revalidateTag(CACHE_TAGS.schedule);
  revalidatePath('/');
  return { ok: true, message: 'Turma salva. A grade do site já foi atualizada.' };
}

export async function deleteClassAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Turma inválida.' };

  await removeClass(id, new Date());

  refreshAdmin();
  revalidateTag(CACHE_TAGS.schedule);
  revalidatePath('/');
  return { ok: true, message: 'Turma removida.' };
}

export async function resetScheduleAction(): Promise<ActionResult> {
  await requireAdmin();

  await resetScheduleToSeed(new Date());

  refreshAdmin();
  revalidateTag(CACHE_TAGS.schedule);
  revalidatePath('/');
  return { ok: true, message: 'Grade restaurada para os horários padrão.' };
}

/* -------------------------------------------------------------------------- */
/* Contas e permissões                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Promove uma conta a professor (ADMIN) ou devolve a aluno.
 *
 * Professor e administrador são o mesmo papel: quem ensina precisa aprovar
 * matrícula, lançar presença e registrar grau.
 */
export async function setAccountRoleAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const targetId = text(form, 'userId');
  const role = text(form, 'role');

  if (role !== 'ADMIN' && role !== 'ALUNO') {
    return { ok: false, message: 'Permissão inválida.' };
  }

  // Trava contra se trancar para fora: o último admin não pode se rebaixar
  // sozinho e deixar a academia sem ninguém capaz de aprovar cadastros.
  if (targetId === admin.id && role === 'ALUNO') {
    return {
      ok: false,
      message: 'Você não pode remover o próprio acesso de professor. Peça a outro professor.',
    };
  }

  const result = await setAccountRole(targetId, role as Role);

  refreshAdmin();
  revalidatePath('/admin/contas');
  return result;
}

/* -------------------------------------------------------------------------- */
/* Planos da landing page                                                     */
/* -------------------------------------------------------------------------- */

export async function savePlanAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const result = await upsertPlan(
    {
      id: text(form, 'id') || undefined,
      name: text(form, 'name'),
      priceLabel: text(form, 'priceLabel'),
      periodLabel: text(form, 'periodLabel'),
      summary: text(form, 'summary'),
      features: text(form, 'features'),
      highlighted: form.get('highlighted') === 'on',
    },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  revalidateTag(CACHE_TAGS.plans);
  revalidatePath('/');
  return { ok: true, message: 'Plano salvo. O site já foi atualizado.' };
}

export async function deletePlanAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Plano inválido.' };

  try {
    await removePlan(id, new Date());
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Não foi possível remover.',
    };
  }

  refreshAdmin();
  revalidateTag(CACHE_TAGS.plans);
  revalidatePath('/');
  return { ok: true, message: 'Plano removido do site.' };
}

export async function resetPlansAction(): Promise<ActionResult> {
  await requireAdmin();

  await resetPlansToSeed(new Date());

  refreshAdmin();
  revalidateTag(CACHE_TAGS.plans);
  revalidatePath('/');
  return { ok: true, message: 'Planos de exemplo restaurados.' };
}

/* -------------------------------------------------------------------------- */
/* Calendário                                                                 */
/* -------------------------------------------------------------------------- */

export async function saveEventAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const result = await upsertEvent(
    {
      id: text(form, 'id') || undefined,
      date: text(form, 'date'),
      title: text(form, 'title'),
      kind: text(form, 'kind'),
      time: text(form, 'time'),
      note: text(form, 'note'),
      closesAcademy: form.get('closesAcademy') === 'on',
    },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  return { ok: true, message: 'Evento salvo no calendário.' };
}

export async function deleteEventAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Evento inválido.' };

  await removeEvent(id, new Date());

  refreshAdmin();
  return { ok: true, message: 'Evento removido.' };
}

/** Ajustes da academia — hoje só a chave Pix usada na cobrança. */
export async function saveSettingsAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  await saveAcademySettings(
    { pixKey: text(form, 'pixKey'), pixOwner: text(form, 'pixOwner') },
    new Date(),
  );

  refreshAdmin();
  return { ok: true, message: 'Dados de cobrança salvos.' };
}

/**
 * Troca a academia que o painel está mostrando.
 *
 * Revalida tudo sob /admin: o recorte muda números, listas e chamada de uma
 * vez, e deixar cache de outra unidade na tela seria pior do que recarregar.
 */
export async function setUnitScopeAction(form: FormData): Promise<void> {
  await requireAdmin();

  const scope = toUnitScope(text(form, 'scope'));
  await setUnitScope(scope);

  // O seletor não mostra mensagem: a tela inteira já muda, e isso basta.
  revalidatePath('/admin', 'layout');
}
