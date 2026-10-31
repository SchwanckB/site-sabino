'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin, type Role } from '@/lib/auth';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { checkbox, intInRange, text, textList } from '@/lib/formData';
import { setAccountRole } from '@/lib/repositories/accounts';
import { recordCheckin, undoCheckin } from '@/lib/repositories/attendance';
import { recordAudit, type AuditAction } from '@/lib/repositories/audit';
import { removeEvent, upsertEvent } from '@/lib/repositories/calendar';
import { saveClassLog } from '@/lib/repositories/classLog';
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
  getStudents,
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
  isBelt,
  toUnitId,
  toUnitScope,
  type Gender,
  type PaymentMethod,
  type UserStatus,
} from '@/types/domain';
import { findOpenClasses } from '@/utils/attendanceEngine';
import { saoPauloDateString } from '@/utils/datetime';
import { KIDS_TOTAL_DEGREES } from '@/utils/graduationEngine';
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

function refreshAdmin(): void {
  revalidatePath('/admin', 'layout');
}

/**
 * Anota uma ação destrutiva na trilha de auditoria.
 *
 * Fica num helper para que registrar seja mais curto que não registrar — é a
 * única forma de a trilha continuar completa quando alguém adicionar a próxima
 * ação de desfazer.
 */
async function audit(
  admin: { readonly id: string; readonly name: string },
  action: AuditAction,
  target: { readonly id: string; readonly name: string },
  detail: string,
): Promise<void> {
  await recordAudit({
    at: new Date().toISOString(),
    action,
    byId: admin.id,
    byName: admin.name,
    targetId: target.id,
    targetName: target.name,
    detail,
  });
}

/* -------------------------------------------------------------------------- */
/* Mensalidade: leitura e validação compartilhadas                            */
/* -------------------------------------------------------------------------- */

type PlanInput = Parameters<typeof setupPaymentPlan>[0];

/**
 * Lê e valida os campos da mensalidade.
 *
 * O bloco estava duplicado entre a aprovação e a edição do plano, mensagens de
 * erro inclusive — e com uma divergência que só a duplicação explica: um lia a
 * data em `firstDueDate` e o outro em `dueDate`. Agora os dois aceitam as duas
 * chaves, para não quebrar formulário nenhum, e `firstDueDate` é a preferida.
 */
function readPlanInput(
  form: FormData,
  userId: string,
): { readonly ok: true; readonly input: PlanInput } | { readonly ok: false; readonly message: string } {
  const planId = text(form, 'planId');
  if (!(PLAN_IDS as readonly string[]).includes(planId)) {
    return { ok: false, message: 'Selecione o tipo de mensalidade.' };
  }

  const amountCents = parseCentsInput(text(form, 'amount'));
  if (amountCents === null) {
    return { ok: false, message: 'Informe o valor da mensalidade.' };
  }
  if (amountCents < 0) {
    return { ok: false, message: 'O valor da mensalidade não pode ser negativo.' };
  }

  const dueDay = intInRange(form, 'dueDay', 1, 31);
  if (dueDay === null) {
    return { ok: false, message: 'Informe o dia do vencimento (1 a 31).' };
  }

  // Carência fora da faixa cai no padrão em vez de recusar: é um ajuste fino,
  // não um dado que o professor precise acertar para salvar o plano.
  const graceDays = intInRange(form, 'graceDays', 0, 90) ?? DEFAULT_GRACE_DAYS;

  return {
    ok: true,
    input: {
      userId,
      planId: planId as PlanId,
      // Rótulo escolhido entre os planos da vitrine. Não valida contra a lista:
      // um plano removido do site não pode invalidar a mensalidade de quem já
      // o contratou.
      planName: text(form, 'planName'),
      amountCents,
      dueDay,
      graceDays,
      firstDueDate: text(form, 'firstDueDate') || text(form, 'dueDate'),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Aprovação de cadastro                                                      */
/* -------------------------------------------------------------------------- */

export async function approveStudentAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const studentId = text(form, 'studentId');
  const student = await getStudent(studentId);
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const classIds = textList(form, 'classIds');
  const belt = text(form, 'belt') || 'branca';
  if (!isBelt(belt)) return { ok: false, message: 'Faixa inválida.' };

  /*
   * Grau: vazio é 0 (faixa nova), mas valor fora da escada de 12 é recusado.
   *
   * Antes era `Number(text(...)) || 0`, que transformava tanto `"abc"` quanto
   * `"999"` em zero sem avisar — o professor digitava errado, via "aprovado" e
   * o aluno entrava com grau nenhum.
   */
  const degreeRaw = text(form, 'degree');
  const degree = degreeRaw.length === 0 ? 0 : intInRange(form, 'degree', 0, KIDS_TOTAL_DEGREES);
  if (degree === null) {
    return { ok: false, message: `Grau inválido. Use um número de 0 a ${KIDS_TOTAL_DEGREES}.` };
  }

  const notes = text(form, 'notes');

  const plan = readPlanInput(form, student.id);
  if (!plan.ok) return { ok: false, message: plan.message };

  const now = new Date();

  try {
    await approveStudent(
      student,
      {
        classIds,
        belt,
        degree,
        notes,
        graduatesMonthly: checkbox(form, 'graduatesMonthly'),
      },
      now,
    );
    await setupPaymentPlan(plan.input, now);
  } catch (error) {
    console.error('[admin] falha ao aprovar', error);
    return { ok: false, message: 'Não foi possível aprovar. Tente novamente.' };
  }

  await audit(admin, 'aluno.aprovado', student, `faixa ${belt}, ${degree} grau(s)`);

  refreshAdmin();
  return { ok: true, message: `${student.name} foi aprovado.` };
}

export async function rejectStudentAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const reason = text(form, 'reason');
  if (reason.length < 3) {
    return { ok: false, message: 'Explique o motivo da recusa para o aluno.' };
  }

  await rejectStudent(student, reason, new Date());
  await audit(admin, 'aluno.recusado', student, reason);

  refreshAdmin();
  return { ok: true, message: `Cadastro de ${student.name} recusado.` };
}

export async function setStatusAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const next = text(form, 'status');
  if (!(USER_STATUSES as readonly string[]).includes(next)) {
    return { ok: false, message: 'Status inválido.' };
  }

  await setStudentStatus(student, next as UserStatus, new Date());
  await audit(admin, 'aluno.status', student, `${student.status} → ${next}`);

  refreshAdmin();
  return { ok: true, message: 'Status atualizado.' };
}

/** Altera turmas, faixa, graus e observações de um aluno já ativo. */
export async function updateStudentAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const classIds = textList(form, 'classIds');

  const belt = text(form, 'belt') || student.belt;
  if (!isBelt(belt)) return { ok: false, message: 'Faixa inválida.' };

  // Campo em branco mantém o grau atual; valor fora da escada é recusado em vez
  // de virar um número qualquer.
  const degreeField = text(form, 'degree');
  const degree =
    degreeField.length === 0
      ? student.degree
      : intInRange(form, 'degree', 0, KIDS_TOTAL_DEGREES);
  if (degree === null) {
    return { ok: false, message: `Grau inválido. Use um número de 0 a ${KIDS_TOTAL_DEGREES}.` };
  }

  const genderInput = text(form, 'gender');
  const gender: Gender = (GENDERS as readonly string[]).includes(genderInput)
    ? (genderInput as Gender)
    : student.gender;

  const unit = toUnitId(text(form, 'unit'));

  await updateStudent(
    student.id,
    {
      classIds,
      belt,
      degree,
      gender,
      unit,
      // Checkbox ausente no envio significa desmarcado.
      graduatesMonthly: form.get('graduatesMonthly') === 'on',
      notes: text(form, 'notes'),
    },
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
  const admin = await requireAdmin();

  const studentId = text(form, 'studentId');
  const plan = await getPaymentPlan(studentId);
  if (!plan) return { ok: false, message: 'Mensalidade não encontrada.' };

  await undoLastPayment(plan, new Date());

  // Apagar lançamento financeiro sem deixar rastro é o que tornava "o
  // pagamento do meu filho desapareceu" uma pergunta sem resposta.
  const student = await getStudent(studentId);
  await audit(
    admin,
    'pagamento.desfeito',
    { id: studentId, name: student?.name ?? studentId },
    `valor de referência ${(plan.amountCents / 100).toFixed(2)}`,
  );

  refreshAdmin();
  return { ok: true, message: 'Último pagamento desfeito.' };
}

export async function updatePlanAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const plan = readPlanInput(form, text(form, 'studentId'));
  if (!plan.ok) return { ok: false, message: plan.message };

  await setupPaymentPlan(plan.input, new Date());

  refreshAdmin();
  return { ok: true, message: 'Mensalidade atualizada.' };
}

/* -------------------------------------------------------------------------- */
/* Presença manual — individual e em lote                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resultado de uma tentativa de presença manual.
 *
 * `sem_banco` existe separado de propósito. Antes `recordCheckin` falhando por
 * Redis indisponível era achatado em `ja_registrado`, e o professor lia "este
 * aluno já tem presença hoje" — acreditava, não insistia, e a presença nunca
 * entrava. Mensagem tranquilizadora em cima de falha é pior que erro cru.
 */
type PresenceOutcome = 'ok' | 'ja_registrado' | 'nao_encontrado' | 'inativo' | 'sem_banco';

async function markPresent(
  student: Awaited<ReturnType<typeof getStudent>>,
  adminId: string,
  source: 'manual' | 'lote',
  schedule: Awaited<ReturnType<typeof getSchedule>>,
  now: Date,
): Promise<PresenceOutcome> {
  if (!student) return 'nao_encontrado';
  if (student.status !== 'ativo') return 'inativo';

  // A aula é inferida pelo horário: se houver turma do aluno acontecendo
  // agora, a presença fica vinculada a ela.
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

  if (result.ok) return 'ok';
  return result.reason === 'sem_banco' ? 'sem_banco' : 'ja_registrado';
}

function presenceMessage(outcome: PresenceOutcome): ActionResult {
  switch (outcome) {
    case 'ok':
      return { ok: true, message: 'Presença registrada.' };
    case 'ja_registrado':
      return { ok: false, message: 'Este aluno já tem presença hoje.' };
    case 'inativo':
      return { ok: false, message: 'Aluno não está ativo.' };
    case 'sem_banco':
      return {
        ok: false,
        message:
          'O banco de dados não respondeu. A presença NÃO foi registrada — tente de novo em alguns segundos.',
      };
    default:
      return { ok: false, message: 'Aluno não encontrado.' };
  }
}

export async function markPresenceAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const now = new Date();
  const [student, schedule] = await Promise.all([
    getStudent(text(form, 'studentId')),
    getSchedule(),
  ]);

  const outcome = await markPresent(student, admin.id, 'manual', schedule, now);

  refreshAdmin();
  return presenceMessage(outcome);
}

/**
 * Marca vários alunos de uma vez, a partir da seleção na lista.
 *
 * As fichas e a grade são lidas **uma vez** antes do loop. Antes cada aluno
 * disparava um `getStudent` e um `getSchedule` próprios, em série: marcar a
 * chamada de uma turma de trinta custava mais de sessenta idas ao Redis, uma
 * esperando a outra. A gravação em si continua sequencial — é ela que carrega a
 * trava de "uma presença por dia".
 */
export async function markPresenceBatchAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const ids = textList(form, 'studentIds');
  if (ids.length === 0) {
    return { ok: false, message: 'Selecione pelo menos um aluno.' };
  }

  const now = new Date();
  const [students, schedule] = await Promise.all([getStudents(ids), getSchedule()]);
  const byId = new Map(students.map((student) => [student.id, student]));

  let registered = 0;
  let already = 0;
  let skipped = 0;
  let semBanco = 0;

  for (const id of ids) {
    const outcome = await markPresent(byId.get(id) ?? null, admin.id, 'lote', schedule, now);
    if (outcome === 'ok') registered += 1;
    else if (outcome === 'ja_registrado') already += 1;
    else if (outcome === 'sem_banco') semBanco += 1;
    else skipped += 1;
  }

  refreshAdmin();

  // Banco fora do ar não pode sair como "ignorado": o professor precisa saber
  // que aqueles alunos ficaram sem presença e que a culpa não foi da seleção.
  if (semBanco > 0 && registered === 0) {
    return {
      ok: false,
      message:
        'O banco de dados não respondeu. Nenhuma presença foi registrada — tente de novo em alguns segundos.',
    };
  }

  const parts = [`${registered} presença${registered === 1 ? '' : 's'} registrada${registered === 1 ? '' : 's'}`];
  if (already > 0) parts.push(`${already} já tinha presença hoje`);
  if (semBanco > 0) parts.push(`${semBanco} falhou no banco e precisa ser remarcado`);
  if (skipped > 0) parts.push(`${skipped} ignorado${skipped === 1 ? '' : 's'}`);

  return { ok: registered > 0, message: `${parts.join(', ')}.` };
}

export async function undoPresenceAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const now = new Date();
  const date = text(form, 'date') || saoPauloDateString(now);
  const removed = await undoCheckin(student, date, now);

  if (removed) {
    await audit(admin, 'presenca.removida', student, `presença do dia ${date}`);
  }

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
  const admin = await requireAdmin();

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const result = await undoLastDegree(student, new Date());

  if (result.ok) {
    await audit(admin, 'graduacao.desfeita', student, `voltou de ${student.degree} grau(s)`);
  }

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
  if (!isBelt(toBelt)) return { ok: false, message: 'Faixa inválida.' };

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

  if (result.ok) {
    await audit(admin, 'papel.alterado', { id: targetId, name: targetId }, `virou ${role}`);
  }

  refreshAdmin();
  revalidatePath('/admin/contas');
  return result;
}

/* -------------------------------------------------------------------------- */
/* Planos da landing page                                                     */
/* -------------------------------------------------------------------------- */

export async function savePlanAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();

  const typeValue = text(form, 'type');
  const type = typeValue === 'pacote' ? 'pacote' : 'plano';

  const result = await upsertPlan(
    {
      id: text(form, 'id') || undefined,
      name: text(form, 'name'),
      priceLabel: text(form, 'priceLabel'),
      periodLabel: text(form, 'periodLabel'),
      summary: text(form, 'summary'),
      features: text(form, 'features'),
      highlighted: form.get('highlighted') === 'on',
      type,
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

/* -------------------------------------------------------------------------- */
/* Modo aula                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Presença dentro de uma turma escolhida na tela.
 *
 * Diferente de `markPresenceAction`, que infere a aula pelo horário: aqui o
 * professor já disse qual é. Isso resolve dois casos que a inferência erra —
 * o aluno que veio treinar num dia que não é o dele (presença avulsa) e a
 * chamada feita depois que a aula acabou.
 */
export async function markPresenceInClassAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const studentId = text(form, 'studentId');
  const classId = text(form, 'classId');

  const student = await getStudent(studentId);
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };
  if (student.status !== 'ativo') return { ok: false, message: 'Aluno não está ativo.' };

  const schedule = await getSchedule();
  const slot = schedule.classes.find((item) => item.id === classId) ?? null;
  if (!slot) return { ok: false, message: 'Turma não encontrada.' };

  if (slot.unit !== student.unit) {
    return {
      ok: false,
      message: `${student.name} é aluno de outra academia. Troque a unidade na ficha dele antes.`,
    };
  }

  const result = await recordCheckin(
    {
      student,
      classId: slot.id,
      classTitle: slot.title,
      source: 'manual',
      registeredBy: admin.id,
    },
    new Date(),
  );

  refreshAdmin();

  if (!result.ok) {
    return result.reason === 'ja_registrado'
      ? { ok: false, message: `${student.name} já tem presença hoje.` }
      : { ok: false, message: 'Banco de dados não configurado.' };
  }

  const avulso = !student.classIds.includes(slot.id);
  return {
    ok: true,
    message: avulso
      ? `Presença avulsa de ${student.name} em ${slot.title}.`
      : `${student.name} presente.`,
  };
}

/** Registra o que foi treinado na aula. */
export async function saveClassLogAction(form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();

  const now = new Date();
  const result = await saveClassLog(
    text(form, 'classId'),
    text(form, 'date') || saoPauloDateString(now),
    text(form, 'text'),
    admin.id,
    now,
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  return { ok: true, message: 'Aula registrada no diário.' };
}
