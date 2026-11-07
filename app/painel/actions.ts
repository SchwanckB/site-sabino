'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/components/app/ActionForm';
import { weekdayLabels, type Weekday } from '@/data/seed';
import { resolveActiveProfile, setActiveProfile } from '@/lib/activeProfile';
import { requireUser } from '@/lib/auth';
import { text } from '@/lib/formData';
import { consumeRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { getTodayCheckins, recordCheckin } from '@/lib/repositories/attendance';
import { validateQrToken } from '@/lib/repositories/qr';
import { createDependent, getStudent, listDependents } from '@/lib/repositories/students';
import { getEffectiveScheduleFresh } from '@/lib/schedule';
import { CONSENT_VERSION, filterByUnit, type CheckinResult } from '@/types/domain';
import {
  findNextClass,
  findOpenClasses,
  formatMinutes,
  type ScheduledClass,
} from '@/utils/attendanceEngine';
import { validateDependent } from '@/utils/dependentValidation';

/**
 * Quantas fichas uma conta administra além da própria.
 *
 * Família grande cabe; cadastro em massa por engano, não. O limite é
 * conversável com a recepção, que não tem teto.
 */
const MAX_DEPENDENTES = 6;

/**
 * Check-in do aluno.
 *
 * O QR da parede identifica a **academia**, não a turma — é um cartaz só por
 * unidade. Quem escolhe a aula é o aluno, entre as turmas dele que estão
 * acontecendo naquele momento. Quando só há uma, a tela registra sozinha e
 * ele não escolhe nada.
 *
 * A grade é lida sem cache, e já com as aulas personalizadas do dia
 * aplicadas. `getSchedule()` guarda por uma hora para a landing, e aqui ela
 * não é conteúdo: é a regra que decide se a presença entra. Uma grade de uma
 * hora atrás recusaria o aluno da turma que o professor acabou de criar — ou
 * da aula que ele remarcou para mais cedo cinco minutos antes do treino.
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
  /**
   * Em que pé a aula está: `acontecendo agora`, `começa em 20min`,
   * `terminou às 20:30`.
   *
   * Com a janela de uma hora dos dois lados, a aula que acabou e a que está
   * rolando aparecem juntas na escolha — é o caso do aluno que marca no fim
   * do treino enquanto a turma seguinte já começou. Só o horário de início
   * não resolve: os dois são números parecidos numa lista, e errar aqui
   * joga a presença na turma errada.
   */
  readonly hint: string;
}

export type CheckinOptions =
  | { readonly ok: false; readonly message: string }
  | {
      readonly ok: true;
      readonly classes: readonly OpenClassOption[];
      /**
       * Quando é a próxima aula dele, em texto curto. `null` se ele não tem
       * turma nenhuma atribuída.
       *
       * Serve ao caso de `classes` vazio: sem isto a tela só dizia que não
       * havia aula agora, e o aluno ficava sem saber se errou o dia, o horário
       * ou o cartaz.
       */
      readonly nextClass: string | null;
      /**
       * Turmas abertas que ele **já marcou**, em texto curto. `null` quando
       * ainda há o que marcar.
       *
       * Separa "você escaneou duas vezes" de "você errou o horário": as duas
       * chegam na tela como lista vazia, e a mensagem precisa ser outra.
       */
      readonly alreadyDone: string | null;
    };

/**
 * `terça às 06:00`, `hoje às 19:30`, `amanhã às 20:30`.
 *
 * A janela de check-in nunca é explicada ao aluno — ela abre uma hora antes do
 * início e isso é mecânica interna (ver `CHECKIN_EARLY_MINUTES`). O que ele
 * precisa saber quando a tentativa falha é concreto: qual é a próxima aula
 * dele. "O check-in vale no horário do treino" ensinava uma regra e não
 * respondia à pergunta que o aluno tem na porta da academia.
 */
function proximaAulaEmTexto(
  classes: readonly ScheduledClass[],
  assignedIds: readonly string[],
  now: Date,
): string | null {
  const proxima = findNextClass(classes, assignedIds, now);
  if (!proxima) return null;

  const dia =
    proxima.daysUntil === 0
      ? 'hoje'
      : proxima.daysUntil === 1
        ? 'amanhã'
        : weekdayLabels[proxima.weekday as Weekday].toLowerCase();

  return `${dia} às ${proxima.startTime}`;
}

/** Texto curto do estado da aula, para a tela de escolha. */
function estadoDaAula(slot: {
  readonly inProgress: boolean;
  readonly minutesUntilStart: number;
  readonly endTime: string;
}): string {
  if (slot.inProgress) return 'acontecendo agora';
  if (slot.minutesUntilStart > 0) return `começa em ${formatMinutes(slot.minutesUntilStart)}`;
  return `terminou às ${slot.endTime}`;
}

/**
 * A ficha que o check-in vai usar.
 *
 * **Não é necessariamente a de quem logou.** O pai que treina e tem o filho
 * pendurado na conta alterna de perfil no painel; com o perfil do filho
 * aberto, o QR da parede registra a presença do filho. É o caso de uso
 * inteiro: a criança não tem celular, e quem escaneia é o pai.
 *
 * `resolveActiveProfile` valida o cookie contra a conta, então o pior que um
 * cookie forjado consegue é marcar a presença do próprio dono.
 */
async function fichaAtiva(userId: string) {
  const own = await getStudent(userId);
  const perfil = await resolveActiveProfile(userId, own);
  return perfil?.student ?? null;
}

/**
 * Turmas do aluno abertas agora, na academia do cartaz lido.
 *
 * Fica separado do registro porque a tela precisa perguntar antes de gravar
 * quando há mais de uma aula no mesmo horário.
 */
export async function listCheckinOptions(token: string): Promise<CheckinOptions> {
  const user = await requireUser();

  /*
   * Teto de leituras por aluno.
   *
   * Esta função chama `getEffectiveScheduleFresh()`, que ignora o cache de
   * propósito — é a regra que decide se a presença entra, e uma grade de uma
   * hora atrás recusaria a turma que o professor acabou de criar. O preço é que cada
   * tentativa custa uma leitura real no Redis, o que faz dela um amplificador
   * de carga se chamada em laço. Trinta tentativas em cinco minutos cobrem o
   * aluno que escaneia errado várias vezes na porta da academia.
   */
  const quota = await consumeRateLimit('checkin:list', user.id, 30, 300);
  if (!quota.allowed) {
    return { ok: false, message: rateLimitMessage(quota.retryAfter) };
  }

  const student = await fichaAtiva(user.id);
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

  const now = new Date();
  const [schedule, doDia] = await Promise.all([
    getEffectiveScheduleFresh(now),
    getTodayCheckins([student.id], now),
  ]);

  /*
   * Só as aulas da academia dele.
   *
   * Na grade normal a matrícula já garantia isso: ninguém tem na ficha turma
   * de outra unidade. A turma avulsa não tem matrícula — `openToAll` casa com
   * qualquer aluno —, e sem este recorte o aluno de Terra de Areia via o
   * treino aberto de Três Cachoeiras na lista de check-in.
   */
  const daUnidade = filterByUnit(schedule.classes, student.unit);

  /*
   * As aulas abertas **que ele ainda não marcou**.
   *
   * Com turmas encostadas de hora em hora, quem faz MMA às 19:30 e Jiu às
   * 20:30 tem as duas janelas abertas boa parte da noite. Sem este filtro, o
   * segundo check-in da noite voltava a perguntar "qual aula?" oferecendo a
   * que ele acabou de marcar — e escolher errado devolvia "você já tem
   * presença nesta aula", que parece defeito.
   *
   * Filtrando, o caso comum deixa de perguntar: sobra uma só e a tela
   * registra sozinha.
   */
  const jaMarcadas = new Set((doDia.get(student.id) ?? []).map((entry) => entry.classId));
  const abertas = findOpenClasses(daUnidade, student.classIds, now);
  const pendentes = abertas.filter((slot) => !jaMarcadas.has(slot.classId));

  return {
    ok: true,
    classes: pendentes.map((slot) => ({
      classId: slot.classId,
      title: slot.title,
      level: slot.level ?? '',
      time: slot.startTime,
      hint: estadoDaAula(slot),
    })),
    nextClass:
      pendentes.length === 0
        ? proximaAulaEmTexto(daUnidade, student.classIds, now)
        : null,
    /*
     * Havia aula aberta, mas ele já marcou todas. É diferente de "nenhuma
     * turma sua está acontecendo agora" — ali ele erraria o horário; aqui ele
     * fez tudo certo e só escaneou duas vezes.
     */
    alreadyDone:
      abertas.length > 0 && pendentes.length === 0
        ? abertas.map((slot) => `${slot.title} · ${slot.startTime}`).join(' e ')
        : null,
  };
}

/**
 * Registra a presença nas turmas escolhidas pelo aluno.
 *
 * Recebe **lista**, e não uma turma só, por causa do caso mais comum da
 * academia: quem faz MMA às 19:30 e fica para o Jiu das 20:30. Ele escaneia o
 * cartaz uma vez, na chegada, e a tela pergunta se vai ficar para a seguinte —
 * respondendo que sim, as duas presenças entram na mesma leitura. Obrigá-lo a
 * voltar ao celular uma hora depois é o que fazia a segunda aula ficar sem
 * registro.
 *
 * A contrapartida é conhecida e aceita: a presença da segunda aula é gravada
 * antes de ela acontecer. Quem disser que fica e for embora tem presença a
 * mais, e o professor desfaz na chamada — é o mesmo custo de qualquer lista
 * assinada na entrada.
 *
 * Cada id é reconferido contra as aulas abertas **do aluno**: cliente não é
 * fonte de verdade, e sem isso bastaria mandar a grade inteira no formulário.
 */
export async function checkinAction(
  token: string,
  classIds: readonly string[],
): Promise<CheckinResult> {
  const user = await requireUser();

  /*
   * Teto de gravações por aluno.
   *
   * `listCheckinOptions` já tinha o dele, e esta não — mas é esta que escreve.
   * Server Action é endpoint HTTP: sem teto, um laço contra ela consome o
   * Redis da academia inteira de graça, e a trava por turma não ajuda porque
   * cada tentativa recusada custa a leitura da grade do mesmo jeito.
   *
   * Vinte em cinco minutos: o aluno de duas aulas usa duas, e quem erra o QR
   * várias vezes na porta ainda cabe folgado.
   */
  const quota = await consumeRateLimit('checkin:registrar', user.id, 20, 300);
  if (!quota.allowed) {
    return { ok: false, reason: 'erro', message: rateLimitMessage(quota.retryAfter) };
  }

  const student = await fichaAtiva(user.id);
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
  const schedule = await getEffectiveScheduleFresh(now);
  // Mesmo recorte da listagem: a aula aberta de outra academia não é dele.
  const daUnidade = filterByUnit(schedule.classes, student.unit);

  /*
   * A turma escolhida é reconferida contra as que estão abertas agora.
   *
   * O cliente manda o id, e cliente não é fonte de verdade: sem esta linha,
   * bastaria trocar o valor no formulário para marcar presença numa aula de
   * outro dia. É aqui que a janela de horário e a matrícula são impostas.
   */
  const abertas = findOpenClasses(daUnidade, student.classIds, now);

  // Só as abertas que ele pediu, na ordem da grade. `Set` porque o mesmo id
  // repetido no formulário não pode virar duas tentativas.
  const pedidas = new Set(classIds);
  const escolhidas = abertas.filter((slot) => pedidas.has(slot.classId));

  if (escolhidas.length === 0) {
    if (abertas.length > 0) {
      return {
        ok: false,
        reason: 'sem_aula_agora',
        message: 'Escolha uma das turmas que estão acontecendo agora.',
      };
    }

    const proxima = proximaAulaEmTexto(daUnidade, student.classIds, now);
    return {
      ok: false,
      reason: 'sem_aula_agora',
      message: proxima
        ? `Nenhuma das suas turmas está acontecendo agora. A próxima é ${proxima}.`
        : 'Você ainda não está em nenhuma turma. Fale com a recepção.',
    };
  }

  /*
   * Grava uma a uma, e não em paralelo: a trava é um `SET NX` por turma, e o
   * que importa é saber quais entraram para confirmar pelo nome na tela.
   */
  const registradas: { title: string; time: string }[] = [];
  const repetidas: string[] = [];
  let ultimoAt = '';
  let falhou = false;

  for (const slot of escolhidas) {
    const result = await recordCheckin(
      {
        student,
        classId: slot.classId,
        classTitle: slot.title,
        source: 'qr',
        registeredBy: student.id,
      },
      now,
    );

    if (result.ok) {
      registradas.push({ title: slot.title, time: slot.startTime });
      ultimoAt = result.entry.at;
    } else if (result.reason === 'ja_registrado') {
      repetidas.push(slot.title);
    } else {
      falhou = true;
    }
  }

  if (registradas.length === 0) {
    if (repetidas.length > 0) {
      return {
        ok: false,
        reason: 'ja_registrado',
        message: `Você já marcou presença em ${repetidas.join(' e ')}.`,
      };
    }

    return {
      ok: false,
      reason: 'erro',
      message: 'Não foi possível registrar agora. Chame a recepção.',
    };
  }

  // Parte entrou e parte falhou no banco: o aluno não pode sair achando que
  // as duas estão registradas.
  if (falhou) {
    return {
      ok: false,
      reason: 'erro',
      message: `Só ${registradas.map((item) => item.title).join(' e ')} foi registrada. Confira com a recepção antes de treinar.`,
    };
  }

  revalidatePath('/painel');
  revalidatePath('/admin/presenca');
  revalidatePath('/admin/aula');

  return {
    ok: true,
    classTitle: registradas.map((item) => item.title).join(' e '),
    at: ultimoAt,
    classes: registradas,
  };
}

/* -------------------------------------------------------------------------- */
/* Familiar pendurado na conta                                                */
/* -------------------------------------------------------------------------- */

/**
 * Cadastra um familiar na própria conta.
 *
 * O caso que motivou: o pai treina nos adultos, o filho de seis anos treina
 * no infantil e não tem e-mail. Criar um login para a criança é pedir ao pai
 * que invente uma caixa de entrada — e depois que ele lembre de duas senhas.
 * Aqui a ficha da criança pendura na conta dele, e o painel alterna entre os
 * perfis como já alterna entre aluno e professor.
 *
 * A ficha entra **pendente**, como qualquer outra: turma, faixa e mensalidade
 * continuam sendo decisão de quem administra a academia. O que o cadastro
 * dispensa é só o login.
 *
 * O responsável vem da ficha de quem cadastrou, e não de campos digitados:
 * quem está logado *é* o responsável, e pedir o nome dele de novo seria
 * pedir para errar.
 */
export async function registerDependentAction(form: FormData): Promise<ActionResult> {
  const user = await requireUser();

  /*
   * Teto de cadastros.
   *
   * Cada chamada grava uma ficha e um índice. Cinco em dez minutos cobre a
   * família grande que entra toda de uma vez e ainda assim fecha a porta para
   * um laço contra a action.
   */
  const quota = await consumeRateLimit('dependente', user.id, 5, 600);
  if (!quota.allowed) {
    return { ok: false, message: rateLimitMessage(quota.retryAfter) };
  }

  const responsavel = await getStudent(user.id);
  if (!responsavel) {
    return {
      ok: false,
      message: 'Termine o seu próprio cadastro antes de incluir alguém da família.',
    };
  }

  // Dependente de dependente não existe: a ficha que já pendura numa conta
  // não administra outras, senão o vínculo viraria uma árvore sem dono claro.
  if (responsavel.guardianUserId !== null) {
    return { ok: false, message: 'Este perfil não pode cadastrar outras pessoas.' };
  }

  const now = new Date();
  const validation = validateDependent(
    {
      name: text(form, 'name'),
      birthDate: text(form, 'birthDate'),
      cpf: text(form, 'cpf'),
      gender: text(form, 'gender'),
      unit: text(form, 'unit') || responsavel.unit,
    },
    now,
  );

  if (!validation.valid) {
    const primeiro = Object.values(validation.fieldErrors)[0];
    return { ok: false, message: primeiro ?? 'Confira os dados e tente de novo.' };
  }

  const dados = validation.normalized;

  const ja = await listDependents(user.id);
  if (ja.length >= MAX_DEPENDENTES) {
    return {
      ok: false,
      message: `Você já tem ${MAX_DEPENDENTES} pessoas na conta. Fale com a recepção para incluir mais.`,
    };
  }

  // Mesmo nome e mesma data já na conta: é o dedo duplo no botão, não um
  // irmão gêmeo homônimo.
  if (ja.some((item) => item.name === dados.name && item.birthDate === dados.birthDate)) {
    return { ok: false, message: `${dados.name} já está cadastrado na sua conta.` };
  }

  await createDependent(
    user.id,
    {
      name: dados.name,
      // O e-mail da conta: é por onde a academia fala com a família, e a
      // ficha da criança não tem um próprio.
      email: responsavel.email,
      phone: responsavel.phone,
      cpf: dados.cpf,
      birthDate: dados.birthDate,
      gender: dados.gender,
      unit: dados.unit,
      belt: 'branca',
      // Quem está logado é o responsável — menor de idade herda os dados dele.
      guardianName: dados.isMinor ? responsavel.name : null,
      guardianPhone: dados.isMinor ? responsavel.phone : null,
      guardianCpf: dados.isMinor ? responsavel.cpf : null,
      docBlobKey: null,
      // O consentimento é o da conta: foi esta pessoa que o deu, e é ela que
      // responde pelo menor.
      consentVersion: responsavel.consentVersion || CONSENT_VERSION,
      consentAt: now.toISOString(),
    },
    now,
  );

  revalidatePath('/painel');
  revalidatePath('/admin', 'layout');

  return {
    ok: true,
    message: `${dados.name} foi enviado para aprovação. A recepção define turma e mensalidade.`,
  };
}

/**
 * Troca o perfil mostrado no painel.
 *
 * Não confere nada aqui de propósito: o cookie é lido por
 * `resolveActiveProfile`, que valida o id contra a conta a cada requisição.
 * Gravar o id de um aluno qualquer não dá acesso a nada — ele é descartado na
 * volta e a tela abre no perfil próprio.
 */
export async function switchProfileAction(form: FormData): Promise<void> {
  await requireUser();
  await setActiveProfile(text(form, 'studentId'));
  revalidatePath('/painel', 'layout');
}
