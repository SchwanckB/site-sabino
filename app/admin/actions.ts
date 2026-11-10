'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { authorize, isGestaoEmail, requireStaff } from '@/lib/auth';
import { ROLE_LABELS, isRole } from '@/lib/roles';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { checkbox, intInRange, text, textList } from '@/lib/formData';
import { deleteAccount, getAccountSummary, setAccountRole } from '@/lib/repositories/accounts';
import { recordCheckin, undoCheckin } from '@/lib/repositories/attendance';
import { recordAudit, type AuditAction } from '@/lib/repositories/audit';
import { deleteDocument } from '@/lib/repositories/documents';
import { removeEvent, upsertEvent } from '@/lib/repositories/calendar';
import {
  isMonth,
  postRecurringForMonth,
  removeCashEntry,
  removeRecurringCost,
  setMonthClosed,
  upsertCashEntry,
  upsertRecurringCost,
} from '@/lib/repositories/cashbook';
import { removeClassOverride, upsertClassOverride } from '@/lib/repositories/classOverrides';
import { removeOneOffClass, upsertOneOffClass } from '@/lib/repositories/oneOffClasses';
import { saveClassLog } from '@/lib/repositories/classLog';
import { clearFollowup, isFollowupKind, markFollowup } from '@/lib/repositories/followups';
import { registerDegree, promoteBelt, undoLastDegree } from '@/lib/repositories/graduation';
import {
  getPaymentPlan,
  registerPayment,
  setupPaymentPlan,
  undoLastPayment,
} from '@/lib/repositories/payments';
import { removePlan, resetPlansToSeed, upsertPlan } from '@/lib/repositories/plansAdmin';
import { saveAcademySettings } from '@/lib/repositories/settings';
import {
  getEditableSchedule,
  removeClass,
  resetScheduleToSeed,
  upsertClass,
} from '@/lib/repositories/scheduleAdmin';
import {
  approveStudent,
  deleteStudent,
  getStudent,
  getStudents,
  isDependentId,
  linkDependent,
  listStudentsByStatus,
  rejectStudent,
  setGraduationAnchors,
  setStudentStatus,
  unlinkDependent,
  updateStudent,
} from '@/lib/repositories/students';
import { getEffectiveSchedule, getSchedule } from '@/lib/schedule';
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
import { findOpenClasses, occursOnDate } from '@/utils/attendanceEngine';
import { belongsToClass } from '@/utils/classAttendees';
import { formatBr, saoPauloDateString } from '@/utils/datetime';
import { KIDS_TOTAL_DEGREES } from '@/utils/graduationEngine';
import {
  DEFAULT_GRACE_DAYS,
  RAISE_MAX_PERCENT,
  RAISE_MIN_PERCENT,
  formatCents,
  installmentCents,
  parseCentsInput,
  parsePercentInput,
  raisedCents,
  type PlanId,
} from '@/utils/paymentEngine';

/**
 * Ações do administrador.
 *
 * **Toda** ação começa por `authorize(permissão)`. Server Actions são endpoints
 * HTTP públicos: sem essa checagem, qualquer pessoa com o ID da action poderia
 * aprovar matrículas ou quitar mensalidades — e, desde que o painel tem dois
 * níveis, o professor chamaria por fora o que não aparece no menu dele.
 *
 * A permissão de cada ação é a do assunto, não a da tela que a dispara: ver a
 * tabela em `lib/roles.ts`.
 */

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

const PLAN_IDS: readonly PlanId[] = ['mensal', 'trimestral', 'anual'];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data civil escolhida pelo professor, gravada como instante.
 *
 * Meio-dia em UTC, e não meia-noite: às 9h de São Paulo o dia civil é o mesmo
 * que ele escolheu no calendário. Com meia-noite UTC, a conversão para o fuso
 * da academia (UTC-3) recuaria a data um dia na exibição.
 */
function atMidday(civilDate: string): string {
  return `${civilDate}T12:00:00.000Z`;
}

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

  /*
   * Desconto: bolsa, irmão, combinado.
   *
   * Campo ausente preserva o que está gravado — a aprovação não manda este
   * campo, e zerar o desconto de quem já tem bolsa a cada edição de valor
   * seria o pior tipo de erro silencioso.
   */
  const descontoBruto = text(form, 'discount');
  const discountCents = descontoBruto.length > 0 ? parseCentsInput(descontoBruto) : undefined;
  if (discountCents === null) {
    return { ok: false, message: 'Desconto inválido. Use apenas números.' };
  }
  if (discountCents !== undefined && discountCents > amountCents) {
    return {
      ok: false,
      message: 'O desconto não pode ser maior que a mensalidade. Para isentar, use o valor cheio.',
    };
  }

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
      ...(discountCents !== undefined ? { discountCents } : {}),
      ...(form.has('discountReason') ? { discountReason: text(form, 'discountReason') } : {}),
      changeNote: text(form, 'changeNote'),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Aprovação de cadastro                                                      */
/* -------------------------------------------------------------------------- */

export async function approveStudentAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

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
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

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
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

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

/**
 * Apaga o cadastro inteiro: ficha, histórico, arquivo e conta de login.
 *
 * **Não tem desfazer.** Para quem apenas parou de treinar existe o status
 * "inativo", que some das listas e da cobrança preservando o histórico. Isto
 * aqui é para cadastro de teste e para pedido de exclusão do próprio aluno.
 *
 * Exige que o professor digite o nome do aluno. Uma caixa de confirmação sozinha
 * é um clique de distância de apagar a ficha errada numa lista de homônimos, e
 * o estrago não é recuperável.
 *
 * A ordem importa: Redis primeiro, depois arquivo, depois Clerk. Se o Clerk
 * falhar, sobra um login sem dados — incômodo e corrigível pelo painel. Se
 * fosse ao contrário, sobraria a ficha de alguém que já não consegue entrar.
 */
export async function deleteStudentAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const digitado = text(form, 'confirmName');
  if (digitado.toLowerCase() !== student.name.trim().toLowerCase()) {
    return {
      ok: false,
      message: `Para apagar, digite o nome exatamente como está na ficha: ${student.name}`,
    };
  }

  // Registrado antes: depois de apagar não há de onde tirar nome nem e-mail.
  await audit(
    admin,
    'aluno.apagado',
    student,
    `${student.email || 'sem e-mail'} · cadastro de ${student.createdAt.slice(0, 10)}`,
  );

  try {
    await deleteStudent(student);
  } catch (error) {
    console.error('[admin] falha ao apagar a ficha', error);
    return { ok: false, message: 'Não foi possível apagar o cadastro. Nada foi removido.' };
  }

  if (student.docBlobKey) {
    // Falhar aqui não desfaz o que já foi apagado; registra e segue.
    try {
      await deleteDocument(student.docBlobKey);
    } catch (error) {
      console.error('[admin] ficha apagada, mas o arquivo ficou no Blob', error);
    }
  }

  /*
   * O dependente não tem login para apagar.
   *
   * A ficha da criança pendura na conta do responsável e nunca existiu no
   * Clerk. Chamar `deleteAccount` com um id `dep_…` bateria num 404 — que a
   * função trata como "já não existe" e devolve `false`, levando a tela a
   * dizer que o login não pôde ser removido. Uma falha inventada sobre uma
   * conta que nunca houve.
   */
  const temLogin = !isDependentId(student.id);

  let loginApagado = false;
  if (temLogin) {
    try {
      loginApagado = await deleteAccount(student.id);
    } catch (error) {
      console.error('[admin] ficha apagada, mas a conta do Clerk continua', error);
    }
  }

  refreshAdmin();
  revalidatePath('/admin/alunos');
  revalidatePath('/painel', 'layout');

  if (!temLogin) {
    return {
      ok: true,
      message: `Cadastro de ${student.name} apagado. Ele some do perfil de quem o cadastrou.`,
    };
  }

  return {
    ok: true,
    message: loginApagado
      ? `Cadastro de ${student.name} apagado, inclusive o login.`
      : `Cadastro de ${student.name} apagado. A conta de login não pôde ser removida — confira no painel do Clerk.`,
  };
}

/**
 * Apaga uma conta de login pela tela de contas.
 *
 * Existe porque faltava caminho para o caso mais comum de conta velha: quem
 * criou o login, não terminou o cadastro e nunca mais voltou. Essas pessoas
 * não têm ficha, então não têm página de aluno — e apagar só existia lá.
 * Ficavam na lista para sempre.
 *
 * Quando há ficha, apaga tudo junto: presenças, graduações, mensalidade,
 * documento e login. É a mesma limpeza de `deleteStudentAction`, pelo outro
 * lado da porta.
 *
 * A confirmação é o **e-mail**, e não o nome: conta sem ficha muitas vezes não
 * tem nome preenchido, e "Sem nome" não confirma nada.
 */
export async function deleteAccountAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('contas');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const targetId = text(form, 'userId');
  if (targetId.length === 0) return { ok: false, message: 'Conta inválida.' };

  if (targetId === admin.id) {
    return {
      ok: false,
      message: 'Você não pode apagar a sua própria conta. Peça a outro professor.',
    };
  }

  const account = await getAccountSummary(targetId);
  if (!account) {
    return { ok: false, message: 'Conta não encontrada. Ela já pode ter sido removida.' };
  }

  // ADMIN_EMAILS reconstrói o acesso no próximo login. Apagar a conta aqui
  // deixaria a pessoa entrar de novo, como professor, e parecer um fantasma.
  if (account.email.length > 0 && isGestaoEmail(account.email)) {
    return {
      ok: false,
      message:
        'Este e-mail está em ADMIN_EMAILS: a conta voltaria no próximo login. Remova-o da variável de ambiente na Vercel primeiro.',
    };
  }

  const digitado = text(form, 'confirmEmail').trim().toLowerCase();
  if (digitado !== account.email.trim().toLowerCase()) {
    return {
      ok: false,
      message: `Para apagar, digite o e-mail exatamente como está na conta: ${account.email || '(conta sem e-mail)'}`,
    };
  }

  const student = await getStudent(targetId);

  // Registrado antes de apagar: depois não há de onde tirar nome nem e-mail.
  await audit(
    admin,
    'conta.apagada',
    { id: targetId, name: student?.name ?? account.name },
    `${account.email || 'sem e-mail'} · ${student ? 'tinha ficha de aluno' : 'nunca preencheu a ficha'}`,
  );

  if (student) {
    try {
      await deleteStudent(student);
    } catch (error) {
      console.error('[admin] falha ao apagar a ficha', error);
      return { ok: false, message: 'Não foi possível apagar a ficha. Nada foi removido.' };
    }

    if (student.docBlobKey) {
      // Falhar aqui não desfaz o que já foi apagado; registra e segue.
      try {
        await deleteDocument(student.docBlobKey);
      } catch (error) {
        console.error('[admin] ficha apagada, mas o arquivo ficou no Blob', error);
      }
    }
  }

  let loginApagado = false;
  try {
    loginApagado = await deleteAccount(targetId);
  } catch (error) {
    console.error('[admin] falha ao apagar a conta no Clerk', error);
    return {
      ok: false,
      message: student
        ? 'A ficha foi apagada, mas a conta de login continua. Tente de novo ou remova pelo painel do Clerk.'
        : 'Não foi possível apagar a conta de login. Tente de novo em alguns segundos.',
    };
  }

  refreshAdmin();
  revalidatePath('/admin/alunos');

  const quem = student?.name ?? account.name;
  return {
    ok: true,
    message: loginApagado
      ? `Conta de ${quem} apagada${student ? ', com a ficha e todo o histórico' : ''}.`
      : `A conta de ${quem} já não existia no provedor de login. O resto foi limpo.`,
  };
}

/** Altera turmas, faixa, graus e observações de um aluno já ativo. */
export async function updateStudentAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('alunos');
  if (!auth.ok) return auth;

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

  /*
   * Nome: o aluno digita no cadastro e erra — abreviado, tudo minúsculo, com
   * o sobrenome faltando. Até agora só dava para corrigir no banco. Em branco
   * mantém o atual, para um envio sem o campo não apagar a ficha.
   */
  const nomeDigitado = text(form, 'name').trim();
  if (nomeDigitado.length > 0 && nomeDigitado.length < 3) {
    return { ok: false, message: 'O nome precisa ter pelo menos 3 letras.' };
  }
  const name = nomeDigitado.length > 0 ? nomeDigitado : student.name;

  const now = new Date();

  await updateStudent(
    student.id,
    {
      name,
      classIds,
      belt,
      degree,
      gender,
      unit,
      // Checkbox ausente no envio significa desmarcado.
      graduatesMonthly: form.get('graduatesMonthly') === 'on',
      notes: text(form, 'notes'),
    },
    now,
  );

  /*
   * Matrícula e última graduação vão por um caminho próprio.
   *
   * Não são campos comuns da ficha: são as âncoras da agenda de graduação, e
   * `setGraduationAnchors` reindexa `graduation:due` junto. Há aluno que
   * treinava antes do sistema existir e entrou com a data da aprovação, e há
   * quem não lembre quando graduou — as duas precisam ser corrigíveis.
   */
  const hoje = saoPauloDateString(now);
  const anchors: { joinedAt?: string; lastGraduationAt?: string | null } = {};

  const joinedField = text(form, 'joinedAt').trim();
  if (joinedField.length > 0) {
    if (!DATE_ONLY.test(joinedField)) {
      return { ok: false, message: 'Data de matrícula inválida.' };
    }
    if (joinedField > hoje) {
      return { ok: false, message: 'A data de matrícula não pode estar no futuro.' };
    }
    if (student.birthDate.length > 0 && joinedField < student.birthDate) {
      return {
        ok: false,
        message: 'A matrícula não pode ser anterior à data de nascimento do aluno.',
      };
    }
    if (joinedField !== (student.joinedAt ?? '').slice(0, 10)) {
      anchors.joinedAt = atMidday(joinedField);
    }
  }

  /*
   * Última graduação aceita ser esvaziada: é assim que se desfaz um valor
   * posto por engano, e o aluno volta a contar o tempo desde a matrícula.
   * Para distinguir "não mandei o campo" de "apaguei o campo", o formulário
   * envia um marcador junto.
   */
  const temCampoGraduacao = form.get('lastGraduationAtPresent') === 'on';
  const graduationField = text(form, 'lastGraduationAt').trim();

  if (temCampoGraduacao) {
    if (graduationField.length === 0) {
      if (student.lastGraduationAt !== null) anchors.lastGraduationAt = null;
    } else {
      if (!DATE_ONLY.test(graduationField)) {
        return { ok: false, message: 'Data da última graduação inválida.' };
      }
      if (graduationField > hoje) {
        return { ok: false, message: 'A última graduação não pode estar no futuro.' };
      }

      const matricula = (anchors.joinedAt ?? student.joinedAt ?? '').slice(0, 10);
      if (matricula.length > 0 && graduationField < matricula) {
        return {
          ok: false,
          message: 'A última graduação não pode ser anterior à matrícula.',
        };
      }

      if (graduationField !== (student.lastGraduationAt ?? '').slice(0, 10)) {
        anchors.lastGraduationAt = atMidday(graduationField);
      }
    }
  }

  if (anchors.joinedAt !== undefined || anchors.lastGraduationAt !== undefined) {
    await setGraduationAnchors(student, anchors, now);

    refreshAdmin();
    return {
      ok: true,
      message:
        student.category === 'kids'
          ? 'Dados atualizados. A agenda de graduação foi recalculada a partir das novas datas.'
          : 'Dados atualizados.',
    };
  }

  refreshAdmin();
  return { ok: true, message: 'Dados atualizados.' };
}

/* -------------------------------------------------------------------------- */
/* Financeiro                                                                 */
/* -------------------------------------------------------------------------- */

export async function registerPaymentAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const studentId = text(form, 'studentId');
  const plan = await getPaymentPlan(studentId);
  if (!plan) return { ok: false, message: 'Este aluno ainda não tem mensalidade definida.' };

  const method = text(form, 'method') || 'pix';
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { ok: false, message: 'Forma de pagamento inválida.' };
  }

  const amountOverride = parseCentsInput(text(form, 'amount'));

  const resultado = await registerPayment(
    plan,
    {
      method: method as PaymentMethod,
      // Sem valor informado, o padrão é a parcela **com desconto** — é o que o
      // aluno de bolsa deve, e cobrar a tabela dele seria erro silencioso.
      amountCents: amountOverride ?? installmentCents(plan),
      registeredBy: admin.id,
    },
    new Date(),
  );

  refreshAdmin();

  /*
   * A mensagem diz o que aconteceu com o dinheiro.
   *
   * Pagamento parcial não quita, e anunciar "pagamento registrado" seco faria
   * o professor acreditar que o aluno está em dia — o erro que o parcial
   * existe para evitar.
   */
  const { entry, partial, plan: atualizado } = resultado;

  if (partial) {
    return {
      ok: true,
      message: `Recebido ${formatCents(entry.amountCents)}. Falta ${formatCents(
        Math.max(0, installmentCents(plan) - atualizado.creditCents),
      )} para fechar a parcela de ${formatBr(plan.dueDate)}.`,
    };
  }

  const recibo = entry.receiptNumber > 0 ? ` Recibo nº ${entry.receiptNumber}.` : '';

  if (entry.installments > 1) {
    return {
      ok: true,
      message: `${entry.installments} parcelas quitadas. Próximo vencimento em ${formatBr(
        atualizado.dueDate,
      )}.${recibo}`,
    };
  }

  const troco =
    atualizado.creditCents > 0
      ? ` Sobraram ${formatCents(atualizado.creditCents)} como crédito.`
      : '';

  return {
    ok: true,
    message: `Pagamento registrado. Próximo vencimento em ${formatBr(atualizado.dueDate)}.${recibo}${troco}`,
  };
}

export async function undoPaymentAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

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
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const plan = readPlanInput(form, text(form, 'studentId'));
  if (!plan.ok) return { ok: false, message: plan.message };

  // `registeredBy` entra aqui, e não em `readPlanInput`: a leitura do
  // formulário não conhece quem está logado, e o histórico de valor precisa
  // saber quem reajustou.
  const salvo = await setupPaymentPlan({ ...plan.input, registeredBy: admin.id }, new Date());

  refreshAdmin();

  const liquido = installmentCents(salvo);
  return {
    ok: true,
    message:
      salvo.discountCents > 0
        ? `Mensalidade atualizada: ${formatCents(salvo.amountCents)} com ${formatCents(
            salvo.discountCents,
          )} de desconto — o aluno paga ${formatCents(liquido)}.`
        : `Mensalidade atualizada para ${formatCents(liquido)}.`,
  };
}

/**
 * Reajuste em lote.
 *
 * Reajustar um por um é o que fazia o professor postergar o reajuste: trinta
 * alunos, trinta telas. Aqui o percentual é aplicado sobre o valor de tabela
 * de cada um, o desconto de quem tem bolsa é preservado, e cada mudança entra
 * no histórico individual com o motivo.
 *
 * O vencimento **não** se move: reajuste é valor, não prazo.
 */
export async function bulkRaiseAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const ids = textList(form, 'studentIds');
  if (ids.length === 0) return { ok: false, message: 'Selecione pelo menos um aluno.' };

  const percentual = parsePercentInput(text(form, 'percent'));
  if (percentual === null) {
    return {
      ok: false,
      message: `Informe o percentual do reajuste, entre ${RAISE_MIN_PERCENT}% e +${RAISE_MAX_PERCENT}%.`,
    };
  }

  const note = text(form, 'changeNote') || `reajuste de ${percentual}%`;
  const now = new Date();

  let aplicados = 0;
  let semPlano = 0;

  for (const id of ids) {
    const atual = await getPaymentPlan(id);
    if (!atual) {
      semPlano += 1;
      continue;
    }

    const novo = raisedCents(atual.amountCents, percentual);
    if (novo === atual.amountCents) continue;

    await setupPaymentPlan(
      {
        userId: id,
        planId: atual.planId,
        planName: atual.planName,
        amountCents: novo,
        dueDay: atual.dueDay,
        graceDays: atual.graceDays,
        // Preserva o vencimento em aberto: o reajuste não antecipa nem adia.
        firstDueDate: atual.dueDate,
        registeredBy: admin.id,
        changeNote: note,
      },
      now,
    );

    aplicados += 1;
  }

  refreshAdmin();

  if (aplicados === 0) {
    return { ok: false, message: 'Nenhuma mensalidade foi alterada.' };
  }

  return {
    ok: true,
    message:
      semPlano > 0
        ? `${aplicados} mensalidades reajustadas. ${semPlano} sem mensalidade definida ficaram de fora.`
        : `${aplicados} ${aplicados === 1 ? 'mensalidade reajustada' : 'mensalidades reajustadas'}.`,
  };
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
type PresenceOutcome =
  | 'ok'
  | 'ja_registrado'
  | 'nao_encontrado'
  | 'inativo'
  | 'sem_banco'
  | 'turma_invalida'
  | 'data_invalida';

async function markPresent(
  student: Awaited<ReturnType<typeof getStudent>>,
  adminId: string,
  source: 'manual' | 'lote',
  schedule: Awaited<ReturnType<typeof getSchedule>>,
  now: Date,
  /**
   * Turma escolhida na tela. Quando vem, manda — e é o caminho preferido.
   *
   * Sem ela a aula é inferida pelo relógio, e fora da janela a presença
   * ficava com `classId: null`: um registro que conta no total e no ranking
   * mas some do relatório de frequência, porque lá o casamento é por turma.
   * Chamada feita depois do horário caía sempre nesse buraco.
   */
  chosenClassId?: string | null,
  /** Dia do treino, quando a chamada está sendo lançada depois. */
  onDate?: string | null,
): Promise<PresenceOutcome> {
  if (!student) return 'nao_encontrado';
  if (student.status !== 'ativo') return 'inativo';

  const hoje = saoPauloDateString(now);
  const dia = onDate && onDate.length > 0 ? onDate : hoje;

  // Data do futuro não é chamada atrasada, é dedo errado no calendário.
  if (!DATE_ONLY.test(dia) || dia > hoje) return 'data_invalida';

  const escolhida =
    chosenClassId && chosenClassId.length > 0
      ? (schedule.classes.find((slot) => slot.id === chosenClassId) ?? null)
      : null;

  if (chosenClassId && chosenClassId.length > 0 && !escolhida) return 'turma_invalida';

  /*
   * A unidade da ficha **não** limita onde o aluno treina.
   *
   * Ela diz onde ele treina de hábito — é o recorte das listas, da cobrança e
   * do relatório. Onde ele treinou naquele dia é outra coisa: quem é de Terra
   * de Areia e aparece em Três Cachoeiras numa quinta treinou em Três
   * Cachoeiras, e a presença é desse treino.
   *
   * Aqui havia uma recusa — "troque a unidade na ficha dele antes". Ela
   * transformava uma visita de uma noite numa alteração de cadastro, que
   * depois ninguém desfazia: o aluno passava a constar da outra academia na
   * lista, no financeiro e no relatório. O professor, com a turma esperando,
   * ou fazia isso ou deixava a presença de fora.
   *
   * A visita aparece marcada na chamada (ver `visitor` em `ClassRoster`), que
   * é o que o professor precisa saber — e não um bloqueio.
   */

  /*
   * Sem turma escolhida, a aula sai do horário — e, fora de qualquer janela,
   * da grade do próprio aluno naquele dia.
   *
   * O segundo passo entrou porque o primeiro deixava um buraco: chamada
   * lançada depois do treino gravava `classId: null`, e presença sem turma
   * conta no total e no ranking mas some do relatório de frequência. Se o
   * aluno tem **uma** turma naquele dia, não há o que adivinhar. Tendo duas,
   * continua nulo: chutar entre elas seria pior que deixar em branco.
   */
  let inferida: { readonly id: string; readonly title: string; readonly startTime: string } | null =
    null;

  if (!escolhida) {
    const aberta = dia === hoje ? findOpenClasses(schedule.classes, student.classIds, now)[0] : null;

    if (aberta) {
      inferida = { id: aberta.classId, title: aberta.title, startTime: aberta.startTime };
    } else {
      const doDia = schedule.classes.filter(
        (slot) => student.classIds.includes(slot.id) && occursOnDate(slot, dia),
      );
      const unica = doDia.length === 1 ? doDia[0] : null;
      if (unica) {
        inferida = { id: unica.id, title: unica.title, startTime: unica.startTime };
      }
    }
  }

  const turma = escolhida ?? inferida;

  const result = await recordCheckin(
    {
      student,
      classId: turma?.id ?? null,
      classTitle: turma?.title ?? null,
      source,
      registeredBy: adminId,
      ...(dia !== hoje
        ? { onDate: dia, onTime: turma?.startTime ?? '12:00' }
        : {}),
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
      return { ok: false, message: 'Este aluno já tem presença nesta aula hoje.' };
    case 'turma_invalida':
      return { ok: false, message: 'Turma não encontrada na grade.' };
    case 'data_invalida':
      return { ok: false, message: 'Data inválida. A chamada é de hoje ou de um dia passado.' };
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
  const auth = await authorize('aula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const now = new Date();
  const [student, schedule] = await Promise.all([
    getStudent(text(form, 'studentId')),
    getEffectiveSchedule(now),
  ]);

  const outcome = await markPresent(
    student,
    admin.id,
    'manual',
    schedule,
    now,
    text(form, 'classId') || null,
    text(form, 'date') || null,
  );

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
 * trava de "uma presença por aula".
 *
 * `classId` é o jeito certo de chamar: a tela de Presença manda a turma que o
 * professor abriu, e a presença fica vinculada a ela mesmo horas depois do
 * treino. Sem ele, a aula sai do relógio e a chamada tardia vira presença sem
 * turma — que some do relatório de frequência.
 */
export async function markPresenceBatchAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const ids = textList(form, 'studentIds');
  if (ids.length === 0) {
    return { ok: false, message: 'Selecione pelo menos um aluno.' };
  }

  const classId = text(form, 'classId') || null;
  const onDate = text(form, 'date') || null;

  const now = new Date();
  const [students, schedule] = await Promise.all([getStudents(ids), getEffectiveSchedule(now)]);
  const byId = new Map(students.map((student) => [student.id, student]));

  let registered = 0;
  let already = 0;
  let skipped = 0;
  let semBanco = 0;

  for (const id of ids) {
    const outcome = await markPresent(
      byId.get(id) ?? null,
      admin.id,
      'lote',
      schedule,
      now,
      classId,
      onDate,
    );
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
  if (already > 0) parts.push(`${already} já tinha presença nesta aula`);
  if (semBanco > 0) parts.push(`${semBanco} falhou no banco e precisa ser remarcado`);
  if (skipped > 0) parts.push(`${skipped} ignorado${skipped === 1 ? '' : 's'}`);

  return { ok: registered > 0, message: `${parts.join(', ')}.` };
}

export async function undoPresenceAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const now = new Date();
  const date = text(form, 'date') || saoPauloDateString(now);

  /*
   * Qual presença daquele dia some.
   *
   * Desde que a presença é por aula realizada, o aluno pode ter duas no mesmo
   * dia — e desfazer sem dizer qual apagaria a errada. O formulário manda o
   * `classId` da linha em que o professor clicou; vazio significa a presença
   * que ficou sem turma resolvida.
   */
  const classId = text(form, 'classId') || null;
  const removed = await undoCheckin(student, date, classId, now);

  if (removed) {
    await audit(
      admin,
      'presenca.removida',
      student,
      `presença do dia ${date}${classId ? ` na turma ${classId}` : ' (sem turma)'}`,
    );
  }

  refreshAdmin();
  return removed
    ? { ok: true, message: 'Presença removida.' }
    : { ok: false, message: 'Não havia presença nesta aula.' };
}

/* -------------------------------------------------------------------------- */
/* Graduação                                                                  */
/* -------------------------------------------------------------------------- */

export async function registerDegreeAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('alunos');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const result = await registerDegree(student, admin.id, new Date());

  refreshAdmin();
  return result.ok
    ? { ok: true, message: `Grau ${result.degree} registrado para ${student.name}.` }
    : { ok: false, message: 'Este aluno já completou os 12 graus.' };
}

export async function undoDegreeAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('alunos');
  if (!auth.ok) return auth;
  const admin = auth.user;

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
  const auth = await authorize('alunos');
  if (!auth.ok) return auth;
  const admin = auth.user;

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
  const auth = await authorize('horarios');
  if (!auth.ok) return auth;

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
      teacher: text(form, 'teacher'),
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
  const auth = await authorize('horarios');
  if (!auth.ok) return auth;

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Turma inválida.' };

  await removeClass(id, new Date());

  refreshAdmin();
  revalidateTag(CACHE_TAGS.schedule);
  revalidatePath('/');
  return { ok: true, message: 'Turma removida.' };
}

/* -------------------------------------------------------------------------- */
/* Livro-caixa                                                                */
/* -------------------------------------------------------------------------- */

export async function saveCashEntryAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const amountCents = parseCentsInput(text(form, 'amount'));
  if (amountCents === null) {
    return { ok: false, message: 'Informe o valor do lançamento.' };
  }

  const result = await upsertCashEntry(
    {
      id: text(form, 'id') || undefined,
      kind: text(form, 'kind'),
      date: text(form, 'date'),
      amountCents,
      category: text(form, 'category'),
      description: text(form, 'description'),
      unit: text(form, 'unit'),
      registeredBy: admin.id,
    },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  return {
    ok: true,
    message:
      result.entry.kind === 'despesa'
        ? `Saída de ${formatCents(result.entry.amountCents)} lançada.`
        : `Entrada de ${formatCents(result.entry.amountCents)} lançada.`,
  };
}

export async function deleteCashEntryAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

  const result = await removeCashEntry(text(form, 'month'), text(form, 'id'), new Date());
  if (!result.ok) return { ok: false, message: result.error ?? 'Não foi possível remover.' };

  refreshAdmin();
  return { ok: true, message: 'Lançamento removido.' };
}

export async function saveRecurringCostAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

  const amountCents = parseCentsInput(text(form, 'amount'));
  if (amountCents === null) return { ok: false, message: 'Informe o valor da conta fixa.' };

  const result = await upsertRecurringCost(
    {
      id: text(form, 'id') || undefined,
      kind: text(form, 'kind'),
      amountCents,
      category: text(form, 'category'),
      description: text(form, 'description'),
      unit: text(form, 'unit'),
      dueDay: Number(text(form, 'dueDay')) || 1,
    },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();
  return { ok: true, message: 'Conta fixa salva.' };
}

export async function deleteRecurringCostAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Conta fixa inválida.' };

  await removeRecurringCost(id, new Date());

  refreshAdmin();
  return { ok: true, message: 'Conta fixa removida.' };
}

/**
 * Lança as contas fixas do mês de uma vez.
 *
 * É idempotente no repositório: clicar duas vezes não duplica o aluguel. Sem
 * essa garantia o professor evitaria o botão por medo, que é o mesmo que não
 * ter o botão.
 */
export async function postRecurringAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const month = text(form, 'month');
  const result = await postRecurringForMonth(month, admin.id, new Date());

  if (result.error) return { ok: false, message: result.error };

  refreshAdmin();

  if (result.posted === 0) {
    return { ok: true, message: 'As contas fixas deste mês já estavam lançadas.' };
  }

  return {
    ok: true,
    message:
      result.skipped > 0
        ? `${result.posted} contas fixas lançadas. ${result.skipped} já estavam no mês.`
        : `${result.posted} ${result.posted === 1 ? 'conta fixa lançada' : 'contas fixas lançadas'}.`,
  };
}

/**
 * Fecha ou reabre um mês do caixa.
 *
 * Fechar não é burocracia: enquanto todo mês aceita lançamento retroativo,
 * nenhuma comparação entre meses é confiável — o número do mês passado pode
 * mudar depois de ter sido usado para decidir algo.
 */
export async function setMonthClosedAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

  const month = text(form, 'month');
  if (!isMonth(month)) return { ok: false, message: 'Mês inválido.' };

  const fechar = checkbox(form, 'close');

  try {
    await setMonthClosed(month, fechar);
  } catch (error) {
    console.error('[admin] falha ao fechar o mês', error);
    return { ok: false, message: 'Não foi possível alterar o fechamento.' };
  }

  refreshAdmin();
  return {
    ok: true,
    message: fechar
      ? `${month} fechado. Lançamentos neste mês ficam bloqueados.`
      : `${month} reaberto.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Acompanhamento: com quem já falei                                          */
/* -------------------------------------------------------------------------- */

/**
 * Anota que o professor já falou com o aluno sobre um assunto.
 *
 * Uma action para os três assuntos — cobrança, retorno e aniversário — porque
 * a operação é idêntica e o que muda é só a regra de quando o aviso volta,
 * que vive no repositório.
 */
export async function markFollowupAction(form: FormData): Promise<ActionResult> {
  const kind = text(form, 'kind');
  const userId = text(form, 'userId');

  if (!isFollowupKind(kind)) return { ok: false, message: 'Assunto inválido.' };
  if (userId.length === 0) return { ok: false, message: 'Aluno inválido.' };

  /*
   * A permissão sai do assunto, e por isso vem depois de ler o formulário.
   *
   * Aniversário e retorno são conversa de tatame — o professor liga, anota e
   * o aviso para de voltar. Cobrança é dinheiro: quem não vê a mensalidade
   * também não dá a cobrança por feita.
   */
  const auth = await authorize(kind === 'cobranca' ? 'dinheiro' : 'alunos');
  if (!auth.ok) return auth;

  const desfazer = checkbox(form, 'undo');

  try {
    if (desfazer) await clearFollowup(kind, userId);
    else await markFollowup(kind, userId, new Date());
  } catch (error) {
    console.error('[admin] falha ao anotar o contato', error);
    return { ok: false, message: 'Não foi possível anotar. Tente novamente.' };
  }

  refreshAdmin();

  const feito = {
    cobranca: desfazer ? 'Cobrança desmarcada.' : 'Marcado como cobrado.',
    retorno: desfazer ? 'Contato desmarcado.' : 'Anotado. Volta a aparecer em 15 dias.',
    aniversario: desfazer ? 'Parabéns desmarcado.' : 'Parabéns anotado.',
  } as const;

  return { ok: true, message: feito[kind] };
}

/* -------------------------------------------------------------------------- */
/* Aulas personalizadas                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Muda a turma num dia só: outro horário, ou aula cancelada.
 *
 * Não invalida `CACHE_TAGS.schedule` nem a landing page de propósito: a grade
 * anunciada no site não muda, e as exceções são lidas sem cache por quem
 * decide presença. O que precisa se refazer é só o painel.
 */
export async function saveClassOverrideAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula_do_dia');
  if (!auth.ok) return auth;

  const classId = text(form, 'classId');
  const canceled = checkbox(form, 'canceled');

  let startTime = text(form, 'startTime');
  let endTime = text(form, 'endTime');

  if (canceled) {
    /*
     * Cancelar não pede horário — o professor marca a turma e o dia, e pronto.
     * O horário que a turma teria vem da grade, aqui no servidor, só para o
     * registro descrever o que foi cancelado. Pedir isso ao formulário seria
     * deixar o cliente informar um dado que o servidor já conhece.
     */
    const slot = (await getEditableSchedule()).find((item) => item.id === classId);
    if (!slot) return { ok: false, message: 'Turma não encontrada na grade.' };

    startTime = slot.startTime;
    endTime = slot.endTime;
  }

  const result = await upsertClassOverride(
    { classId, date: text(form, 'date'), startTime, endTime, canceled, note: text(form, 'note') },
    new Date(),
  );

  if (!result.ok) return { ok: false, message: result.error };

  const { date, startTime: inicio, endTime: fim } = result.override;

  refreshAdmin();
  return {
    ok: true,
    message: canceled
      ? `Aula cancelada em ${formatBr(date)}. O check-in não vai abrir, e o aluno é avisado no painel.`
      : `Aula personalizada salva: ${formatBr(date)}, ${inicio} às ${fim}. O check-in abre uma hora antes e fecha uma hora depois.`,
  };
}

export async function deleteClassOverrideAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula_do_dia');
  if (!auth.ok) return auth;

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Aula personalizada inválida.' };

  await removeClassOverride(id, new Date());

  refreshAdmin();
  return { ok: true, message: 'Aula personalizada removida. A turma volta ao horário normal.' };
}

export async function resetScheduleAction(): Promise<ActionResult> {
  const auth = await authorize('horarios');
  if (!auth.ok) return auth;

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
 * Define a permissão de uma conta: gestão, professor ou aluno.
 *
 * As três entram pela mesma porta — o que muda é o que o painel mostra e o
 * que as ações aceitam. Ver a tabela em `lib/roles.ts`.
 */
export async function setAccountRoleAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('contas');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const targetId = text(form, 'userId');
  const role = text(form, 'role');

  if (!isRole(role)) {
    return { ok: false, message: 'Permissão inválida.' };
  }

  /*
   * Trava contra se trancar para fora.
   *
   * Quem administra não pode tirar a própria gestão: a tela de contas é o
   * único lugar onde se promove alguém, e sair dela sozinho deixaria a
   * academia sem ninguém capaz de devolver o acesso — a não ser mexendo em
   * variável de ambiente na Vercel.
   */
  if (targetId === admin.id && role !== 'GESTAO') {
    return {
      ok: false,
      message:
        'Você não pode tirar a sua própria gestão. Promova outra pessoa primeiro e peça para ela fazer isso.',
    };
  }

  const result = await setAccountRole(targetId, role);

  if (result.ok) {
    await audit(
      admin,
      'papel.alterado',
      { id: targetId, name: targetId },
      `virou ${ROLE_LABELS[role].toLowerCase()}`,
    );
  }

  refreshAdmin();
  revalidatePath('/admin/contas');
  return result;
}

/* -------------------------------------------------------------------------- */
/* Planos da landing page                                                     */
/* -------------------------------------------------------------------------- */

export async function savePlanAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

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
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

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
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

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
  const auth = await authorize('calendario');
  if (!auth.ok) return auth;

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
  const auth = await authorize('calendario');
  if (!auth.ok) return auth;

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Evento inválido.' };

  await removeEvent(id, new Date());

  refreshAdmin();
  return { ok: true, message: 'Evento removido.' };
}

/** Ajustes da academia — hoje só a chave Pix usada na cobrança. */
export async function saveSettingsAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('dinheiro');
  if (!auth.ok) return auth;

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
  // Não devolve `ActionResult`: aqui a barreira redireciona, como numa página.
  await requireStaff();

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
  const auth = await authorize('aula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const studentId = text(form, 'studentId');
  const classId = text(form, 'classId');

  const student = await getStudent(studentId);
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };
  if (student.status !== 'ativo') return { ok: false, message: 'Aluno não está ativo.' };

  /*
   * Grade **efetiva**, e não a crua.
   *
   * A turma avulsa e a aula remarcada não existem em `schedule:classes` — de
   * propósito, para a grade da semana não ser tocada. Lendo a grade crua, a
   * chamada do sábado avulso devolvia "Turma não encontrada".
   */
  const schedule = await getEffectiveSchedule(new Date());
  const slot = schedule.classes.find((item) => item.id === classId) ?? null;
  if (!slot) return { ok: false, message: 'Turma não encontrada.' };

  /*
   * A data sai da **aula**, não do relógio.
   *
   * A turma avulsa e a ocorrência remarcada carregam `onlyOnDate`. Abrindo o
   * treino de sábado numa segunda para lançar a chamada esquecida, gravar com
   * `new Date()` poria a presença na segunda — numa turma que não acontece
   * na segunda. Derivar daqui, e não de um campo do formulário, torna o erro
   * impossível: o servidor lê a data na própria aula.
   */
  const now = new Date();
  const diaDaAula = slot.onlyOnDate ?? saoPauloDateString(now);

  const result = await recordCheckin(
    {
      student,
      classId: slot.id,
      classTitle: slot.title,
      source: 'manual',
      registeredBy: admin.id,
      ...(diaDaAula !== saoPauloDateString(now)
        ? { onDate: diaDaAula, onTime: slot.startTime }
        : {}),
    },
    now,
  );

  refreshAdmin();

  if (!result.ok) {
    return result.reason === 'ja_registrado'
      ? { ok: false, message: `${student.name} já tem presença nesta aula.` }
      : { ok: false, message: 'Banco de dados não configurado.' };
  }

  /*
   * "Presença avulsa" é o aluno marcado numa turma que não é dele.
   *
   * Na turma avulsa isso não existe: ela é aberta, ninguém a tem na ficha, e
   * chamar todo mundo de avulso faria a tela gritar uma exceção que é a
   * regra. `belongsToClass` conhece as duas situações.
   */
  const foraDaTurma = !belongsToClass(student, slot);
  return {
    ok: true,
    message: foraDaTurma
      ? `Presença avulsa de ${student.name} em ${slot.title}.`
      : `${student.name} presente.`,
  };
}

/** Registra o que foi treinado na aula. */
export async function saveClassLogAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula');
  if (!auth.ok) return auth;
  const admin = auth.user;

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

/* -------------------------------------------------------------------------- */
/* Turma avulsa: a aula que não existe na grade                               */
/* -------------------------------------------------------------------------- */

/**
 * Cria uma turma que acontece num dia só e é aberta a quem aparecer.
 *
 * O treino de sábado de manhã que a academia resolveu abrir nesta semana. É
 * diferente da aula personalizada: lá a turma existe na grade e muda de
 * horário, e o check-in continua restrito a quem a tem na ficha. Aqui não há
 * turma na grade, logo não há matrícula para conferir — e exigir que o
 * professor ponha o sábado na ficha de trinta alunos é o mesmo que não ter
 * o sábado.
 *
 * A grade semanal não é tocada: o sábado avulso não vira horário fixo, e a
 * landing page continua anunciando a grade de verdade.
 */
export async function saveOneOffClassAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula_do_dia');
  if (!auth.ok) return auth;

  const now = new Date();
  const result = await upsertOneOffClass(
    {
      date: text(form, 'date'),
      startTime: text(form, 'startTime'),
      endTime: text(form, 'endTime'),
      title: text(form, 'title'),
      modality: text(form, 'modality'),
      level: text(form, 'level'),
      unit: text(form, 'unit'),
      teacher: text(form, 'teacher'),
    },
    now,
  );

  if (!result.ok) return { ok: false, message: result.error };

  refreshAdmin();

  const { aula } = result;
  return {
    ok: true,
    message: `${aula.title} marcada para ${formatBr(aula.date)}, ${aula.startTime} às ${aula.endTime}. Qualquer aluno ativo da academia pode marcar presença — o check-in abre uma hora antes.`,
  };
}

export async function deleteOneOffClassAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('aula_do_dia');
  if (!auth.ok) return auth;

  const id = text(form, 'id');
  if (id.length === 0) return { ok: false, message: 'Turma avulsa inválida.' };

  await removeOneOffClass(id, new Date());

  refreshAdmin();
  return {
    ok: true,
    message: 'Turma avulsa removida. As presenças já lançadas nela continuam no histórico.',
  };
}


/* -------------------------------------------------------------------------- */
/* Vínculo de responsável: a ficha de quem já treina, pendurada numa conta    */
/* -------------------------------------------------------------------------- */

/**
 * Candidatos a responsável de uma ficha.
 *
 * Conta própria (id do Clerk, não `dep_`), ativa, da mesma academia, e que
 * não seja ela mesma um dependente — vínculo não encadeia. A mesma unidade é
 * uma escolha de recorte, não de segurança: pai e filho na mesma academia é o
 * caso de todos, e oferecer a base inteira num campo de busca é o caminho
 * curto para vincular a pessoa errada.
 */
export async function listGuardianCandidatesAction(
  studentId: string,
): Promise<readonly { id: string; name: string; email: string }[]> {
  const auth = await authorize('matricula');
  if (!auth.ok) return [];

  const student = await getStudent(studentId);
  if (!student) return [];

  const ativos = await listStudentsByStatus('ativo');

  return ativos
    .filter(
      (item) =>
        item.id !== student.id &&
        item.unit === student.unit &&
        item.guardianUserId === null &&
        !isDependentId(item.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((item) => ({ id: item.id, name: item.name, email: item.email }));
}

/**
 * Vincula a ficha a uma conta de responsável.
 *
 * Gestão, e não professor: quem recebe o vínculo passa a ver a ficha inteira
 * daquele aluno — frequência, graduação, mensalidade — e a marcar presença por
 * ele. É uma concessão de acesso aos dados de outra pessoa, quase sempre de um
 * menor, e a decisão é de quem administra a academia. Foi o que ficou
 * combinado: nem todo responsável treina, então não dá para o próprio
 * responsável se conceder o vínculo.
 */
export async function linkGuardianAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  const guardian = await getStudent(text(form, 'guardianId'));
  if (!guardian) {
    return { ok: false, message: 'Escolha uma conta de responsável na lista.' };
  }

  const result = await linkDependent(student, guardian, new Date());
  if (!result.ok) return { ok: false, message: result.message };

  await audit(
    admin,
    'vinculo.criado',
    student,
    `ficha vinculada à conta de ${guardian.name} (${guardian.email})`,
  );

  refreshAdmin();
  return {
    ok: true,
    message: `${student.name.split(' ')[0]} agora aparece no painel de ${guardian.name.split(' ')[0]}, que alterna entre os perfis na própria tela.`,
  };
}

export async function unlinkGuardianAction(form: FormData): Promise<ActionResult> {
  const auth = await authorize('matricula');
  if (!auth.ok) return auth;
  const admin = auth.user;

  const student = await getStudent(text(form, 'studentId'));
  if (!student) return { ok: false, message: 'Aluno não encontrado.' };

  if (student.guardianUserId === null) {
    return { ok: false, message: 'Esta ficha não está vinculada a nenhuma conta.' };
  }

  const anterior = await getStudent(student.guardianUserId);
  await unlinkDependent(student, new Date());

  await audit(
    admin,
    'vinculo.removido',
    student,
    `vínculo com ${anterior?.name ?? student.guardianUserId} desfeito`,
  );

  refreshAdmin();

  /*
   * O aviso importa: a ficha sem login próprio fica sem ninguém que a acesse
   * pelo site. Às vezes é exatamente o que se quer — o aluno fez 18 anos e vai
   * abrir a conta dele. Deixar isso implícito é o caminho para a recepção
   * desfazer o vínculo "para testar" e a família perder o acesso sem entender.
   */
  return {
    ok: true,
    message: isDependentId(student.id)
      ? `Vínculo desfeito. ${student.name.split(' ')[0]} não tem login próprio, então nenhuma conta enxerga esta ficha agora.`
      : 'Vínculo desfeito. O aluno continua acessando pela conta dele.',
  };
}
