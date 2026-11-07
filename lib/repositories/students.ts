import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import {
  asInteger,
  asNullableString,
  asString,
  asStringArray,
  emptyToNull,
  isRecord,
} from '@/lib/repositories/parse';
import {
  ADULT_AGE,
  BELT_IDS,
  GENDERS,
  USER_STATUSES,
  type Category,
  type Gender,
  type PublicStudent,
  type StudentRecord,
  type UserStatus,
  type UnitId,
  DEFAULT_UNIT,
  toUnitId,
} from '@/types/domain';
import { toDocumentKind, type DocumentKind } from '@/lib/documentRules';
import { maskCpf } from '@/utils/cpf';
import { saoPauloDateString } from '@/utils/datetime';
import { SCORE_MIN } from '@/utils/redisScore';
import {
  KIDS_GRADUATION_INTERVAL_DAYS,
  calculateAge,
  toIsoDate,
} from '@/utils/graduationEngine';

/**
 * Ficha do aluno no Redis (`user:{clerkId}`).
 *
 * Toda troca de status é transacional: o aluno sai do set antigo e entra no
 * novo no mesmo `MULTI`, para que as filas do admin nunca mostrem alguém em
 * dois lugares. Os índices de elegibilidade (`graduation:due`) e de cobrança
 * (`payments:due`) são mantidos junto, como descrito em docs/redis-schema.md.
 */

function dayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return 0;
  const [, year, month, day] = match;
  return Math.floor(Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000);
}

function rowToStudent(id: string, row: Record<string, unknown>): StudentRecord {
  const status = USER_STATUSES.includes(asString(row['status']) as UserStatus)
    ? (asString(row['status']) as UserStatus)
    : 'pendente';

  const category: Category = asString(row['category']) === 'adulto' ? 'adulto' : 'kids';

  const rawGender = asString(row['gender']);
  const gender: Gender = (GENDERS as readonly string[]).includes(rawGender)
    ? (rawGender as Gender)
    : 'nao_informado';

  return {
    id,
    name: asString(row['name']),
    email: asString(row['email']),
    phone: asString(row['phone']),
    cpf: asString(row['cpf']),
    birthDate: asString(row['birthDate']),
    status,
    category,
    gender,
    unit: toUnitId(row['unit']),
    graduatesMonthly: row['graduatesMonthly'] !== 'false' && row['graduatesMonthly'] !== false,
    belt: asString(row['belt'], 'branca'),
    degree: asInteger(row['degree'], 0),
    guardianName: asNullableString(row['guardianName']),
    guardianPhone: asNullableString(row['guardianPhone']),
    guardianCpf: asNullableString(row['guardianCpf']),
    guardianUserId: asNullableString(row['guardianUserId']),
    joinedAt: asNullableString(row['joinedAt']),
    lastGraduationAt: asNullableString(row['lastGraduationAt']),
    docBlobKey: asNullableString(row['docBlobKey']),
    // Fichas anteriores ao campo: eram sempre documento de identidade.
    docKind: toDocumentKind(row['docKind']),
    consentVersion: asString(row['consentVersion']),
    consentAt: asString(row['consentAt']),
    classIds: asStringArray(row['classIds']),
    rejectionReason: asNullableString(row['rejectionReason']),
    notes: asString(row['notes']),
    createdAt: asString(row['createdAt']),
    updatedAt: asString(row['updatedAt']),
  };
}

/** Serializa para o hash: só escalares, arrays viram JSON. */
function studentToRow(student: StudentRecord): Record<string, string | number> {
  return {
    name: student.name,
    email: student.email,
    phone: student.phone,
    cpf: student.cpf,
    birthDate: student.birthDate,
    status: student.status,
    category: student.category,
    gender: student.gender,
    unit: student.unit,
    graduatesMonthly: student.graduatesMonthly ? 'true' : 'false',
    belt: student.belt,
    degree: student.degree,
    guardianName: student.guardianName ?? '',
    guardianPhone: student.guardianPhone ?? '',
    guardianCpf: student.guardianCpf ?? '',
    guardianUserId: student.guardianUserId ?? '',
    joinedAt: student.joinedAt ?? '',
    lastGraduationAt: student.lastGraduationAt ?? '',
    docBlobKey: student.docBlobKey ?? '',
    docKind: student.docKind,
    consentVersion: student.consentVersion,
    consentAt: student.consentAt,
    classIds: JSON.stringify(student.classIds),
    rejectionReason: student.rejectionReason ?? '',
    notes: student.notes,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

/**
 * Projeção segura para o cliente. **Único caminho** pelo qual dados de aluno
 * devem atravessar a fronteira servidor → navegador.
 */
export function toPublicStudent(student: StudentRecord, now: Date): PublicStudent {
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    phone: student.phone,
    cpfMasked: maskCpf(student.cpf),
    birthDate: student.birthDate,
    age: student.birthDate ? calculateAge(student.birthDate, now) : 0,
    status: student.status,
    category: student.category,
    gender: student.gender,
    unit: student.unit,
    belt: student.belt,
    degree: student.degree,
    graduatesMonthly: student.graduatesMonthly,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    joinedAt: student.joinedAt,
    lastGraduationAt: student.lastGraduationAt,
    hasDocument: student.docBlobKey !== null,
    docKind: student.docKind,
    classIds: student.classIds,
    rejectionReason: student.rejectionReason,
    notes: student.notes,
    createdAt: student.createdAt,
  };
}

export async function getStudent(id: string): Promise<StudentRecord | null> {
  const redis = getRedis();
  if (!redis) return null;

  const row = emptyToNull(await redis.hgetall<Record<string, unknown>>(redisKeys.user(id)));
  return row ? rowToStudent(id, row) : null;
}

/** Busca várias fichas de uma vez, em um único round-trip. */
export async function getStudents(ids: readonly string[]): Promise<StudentRecord[]> {
  const redis = getRedis();
  if (!redis || ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.hgetall(redisKeys.user(id));
  }

  const rows = (await pipeline.exec()) as (Record<string, unknown> | null)[];

  const students: StudentRecord[] = [];
  rows.forEach((row, index) => {
    const id = ids[index];
    const clean = emptyToNull(row);
    if (id && clean) students.push(rowToStudent(id, clean));
  });

  return students;
}

export async function listIdsByStatus(status: UserStatus): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  return redis.smembers<string[]>(redisKeys.usersByStatus(status));
}

export async function listStudentsByStatus(status: UserStatus): Promise<StudentRecord[]> {
  return getStudents(await listIdsByStatus(status));
}

/** Todos os alunos conhecidos, para busca e listagens do admin. */
export async function listAllStudents(): Promise<StudentRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  return getStudents(await redis.smembers<string[]>('users:index'));
}

export async function countByStatus(): Promise<Record<UserStatus, number>> {
  const redis = getRedis();
  const empty: Record<UserStatus, number> = {
    pendente: 0,
    ativo: 0,
    recusado: 0,
    inativo: 0,
  };
  if (!redis) return empty;

  const pipeline = redis.pipeline();
  for (const status of USER_STATUSES) {
    pipeline.scard(redisKeys.usersByStatus(status));
  }
  const counts = (await pipeline.exec()) as number[];

  return USER_STATUSES.reduce<Record<UserStatus, number>>((acc, status, index) => {
    acc[status] = counts[index] ?? 0;
    return acc;
  }, { ...empty });
}

/** Categoria derivada da idade — revista sempre que a ficha é salva. */
export function categoryFor(birthDate: string, now: Date): Category {
  return calculateAge(birthDate, now) >= ADULT_AGE ? 'adulto' : 'kids';
}

/**
 * Cria a ficha do pré-cadastro com status `pendente`.
 * Idempotente: um segundo envio do mesmo usuário atualiza a ficha existente,
 * desde que ela ainda não tenha sido aprovada.
 */
export async function createPendingStudent(
  input: Omit<
    StudentRecord,
    | 'status'
    | 'createdAt'
    | 'updatedAt'
    | 'joinedAt'
    | 'lastGraduationAt'
    | 'classIds'
    | 'rejectionReason'
    | 'notes'
    | 'degree'
    | 'category'
    | 'unit'
    | 'graduatesMonthly'
    | 'docKind'
    | 'guardianUserId'
  > & {
    readonly degree?: number;
    /** Ausente em cadastro antigo e em teste: cai na unidade padrão. */
    readonly unit?: UnitId;
    readonly graduatesMonthly?: boolean;
    /** Ausente em cadastro antigo e em teste: assume documento de identidade. */
    readonly docKind?: DocumentKind;
    /** Conta responsável, quando a ficha é de um dependente sem login. */
    readonly guardianUserId?: string | null;
  },
  now: Date,
): Promise<StudentRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const existing = await getStudent(input.id);
  if (existing && existing.status === 'ativo') {
    return existing;
  }

  const timestamp = now.toISOString();
  const student: StudentRecord = {
    ...input,
    guardianUserId: input.guardianUserId ?? null,
    degree: input.degree ?? 0,
    unit: input.unit ?? DEFAULT_UNIT,
    graduatesMonthly: input.graduatesMonthly ?? true,
    docKind: input.docKind ?? 'documento',
    category: categoryFor(input.birthDate, now),
    status: 'pendente',
    joinedAt: null,
    lastGraduationAt: null,
    classIds: [],
    rejectionReason: null,
    notes: existing?.notes ?? '',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), studentToRow(student));
  tx.sadd('users:index', student.id);

  // Se já existia em outra fila (ex.: recusado reenviando), tira de lá.
  for (const status of USER_STATUSES) {
    if (status !== 'pendente') {
      tx.srem(redisKeys.usersByStatus(status), student.id);
    }
  }
  tx.sadd(redisKeys.usersByStatus('pendente'), student.id);
  await tx.exec();

  return student;
}

/** Atualiza campos avulsos da ficha. Não mexe em status nem nos índices. */
export async function updateStudent(
  id: string,
  patch: Partial<Omit<StudentRecord, 'id'>>,
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const row: Record<string, string | number> = { updatedAt: now.toISOString() };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    if (key === 'classIds' && Array.isArray(value)) {
      row['classIds'] = JSON.stringify(value);
    } else if (value === null) {
      row[key] = '';
    } else if (typeof value === 'boolean') {
      /*
       * Booleano não tinha ramo e era descartado em silêncio.
       *
       * O hash do Redis só guarda escalares, e `studentToRow` grava booleano
       * como 'true'/'false' — mas este laço só tratava string, número, nulo e
       * `classIds`. `graduatesMonthly: false` não casava com nenhum caso e
       * nunca era escrito: o professor desmarcava "gradua todo mês", salvava,
       * via "Dados atualizados" e o aluno voltava marcado no recarregamento,
       * porque o valor antigo continuava no banco.
       *
       * A mesma serialização de `studentToRow`, para que `rowToStudent` leia
       * de volta sem ambiguidade.
       */
      row[key] = value ? 'true' : 'false';
    } else if (typeof value === 'string' || typeof value === 'number') {
      row[key] = value;
    }
  }

  await redis.hset(redisKeys.user(id), row);
}

/**
 * Corrige as datas que ancoram a graduação: matrícula e última graduação.
 *
 * Não é um `updateStudent` com mais dois campos porque estas duas datas não
 * são só dados da ficha: são a **âncora** da escada de graus da trilha
 * infantil. O índice `graduation:due` guarda, por aluno, o dia em que o
 * próximo grau libera — calculado a partir da última graduação ou, para quem
 * nunca graduou, da matrícula. Trocar as datas pelo caminho comum deixaria o
 * índice parado no valor antigo, e a agenda passaria a liberar grau na data
 * errada, sem nada na tela denunciando a diferença.
 *
 * Gravação e reindexação no mesmo `MULTI`, como todas as trocas de estado
 * deste módulo — e uma reindexação só, mesmo quando as duas datas mudam.
 */
export async function setGraduationAnchors(
  student: StudentRecord,
  patch: {
    /** ISO da matrícula. Ausente mantém a atual. */
    readonly joinedAt?: string;
    /** ISO da última graduação; `null` volta o aluno para "nunca graduou". */
    readonly lastGraduationAt?: string | null;
  },
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const joinedAt = patch.joinedAt ?? student.joinedAt;
  const lastGraduationAt =
    patch.lastGraduationAt === undefined ? student.lastGraduationAt : patch.lastGraduationAt;

  const row: Record<string, string> = { updatedAt: now.toISOString() };
  if (patch.joinedAt !== undefined) row['joinedAt'] = patch.joinedAt;
  // Vazio é como este módulo grava nulo no hash — ver `studentToRow`.
  if (patch.lastGraduationAt !== undefined) row['lastGraduationAt'] = patch.lastGraduationAt ?? '';

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), row);

  // Mesma regra de `approveStudent`: só a trilha infantil ativa tem agenda.
  if (student.status === 'ativo' && student.category === 'kids') {
    const anchor = lastGraduationAt ?? joinedAt ?? now.toISOString();
    tx.zadd(redisKeys.graduationDue(), {
      score: dayNumber(toIsoDate(anchor)) + KIDS_GRADUATION_INTERVAL_DAYS,
      member: student.id,
    });
  }

  await tx.exec();
}

export interface ApprovalInput {
  readonly classIds: readonly string[];
  readonly belt: string;
  readonly degree: number;
  readonly notes: string;
  /** Ausente mantém o que a ficha já tinha (padrão: gradua todo mês). */
  readonly graduatesMonthly?: boolean;
}

/**
 * Aprova o cadastro: status `ativo`, data de matrícula, turmas atribuídas e
 * entrada no índice de elegibilidade de graduação (só para a trilha infantil).
 * Tudo em uma transação.
 */
export async function approveStudent(
  student: StudentRecord,
  input: ApprovalInput,
  now: Date,
): Promise<StudentRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const timestamp = now.toISOString();
  const category = categoryFor(student.birthDate, now);

  const approved: StudentRecord = {
    ...student,
    graduatesMonthly: input.graduatesMonthly ?? student.graduatesMonthly,
    status: 'ativo',
    category,
    belt: input.belt,
    degree: input.degree,
    classIds: input.classIds,
    notes: input.notes,
    joinedAt: student.joinedAt ?? timestamp,
    rejectionReason: null,
    updatedAt: timestamp,
  };

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), studentToRow(approved));
  tx.srem(redisKeys.usersByStatus(student.status), student.id);
  tx.sadd(redisKeys.usersByStatus('ativo'), student.id);
  tx.sadd('users:index', student.id);

  if (category === 'kids') {
    const anchor = approved.lastGraduationAt ?? approved.joinedAt ?? timestamp;
    tx.zadd(redisKeys.graduationDue(), {
      score: dayNumber(toIsoDate(anchor)) + KIDS_GRADUATION_INTERVAL_DAYS,
      member: student.id,
    });
  } else {
    tx.zrem(redisKeys.graduationDue(), student.id);
  }

  await tx.exec();
  return approved;
}

/** Recusa o cadastro, guardando o motivo para o aluno ver. */
export async function rejectStudent(
  student: StudentRecord,
  reason: string,
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), {
    status: 'recusado',
    rejectionReason: reason,
    updatedAt: now.toISOString(),
  });
  tx.srem(redisKeys.usersByStatus(student.status), student.id);
  tx.sadd(redisKeys.usersByStatus('recusado'), student.id);
  tx.zrem(redisKeys.graduationDue(), student.id);
  tx.zrem(redisKeys.paymentsDue(), student.id);
  await tx.exec();
}

/** Muda o status mantendo os índices coerentes (ativo ↔ inativo). */
export async function setStudentStatus(
  student: StudentRecord,
  next: UserStatus,
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), {
    status: next,
    updatedAt: now.toISOString(),
  });
  tx.srem(redisKeys.usersByStatus(student.status), student.id);
  tx.sadd(redisKeys.usersByStatus(next), student.id);

  if (next !== 'ativo') {
    tx.zrem(redisKeys.graduationDue(), student.id);
    tx.zrem(redisKeys.paymentsDue(), student.id);
  }

  await tx.exec();
}

/**
 * Alunos elegíveis a grau hoje, sem varrer a base.
 * Lê o ZSET `graduation:due` por faixa de score.
 */
export async function listGraduationDueIds(now: Date): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const today = dayNumber(saoPauloDateString(now));

  try {
    // SCORE_MIN é o literal que o Redis entende. `Number.NEGATIVE_INFINITY` vira
    // `null` no JSON do protocolo REST e o servidor responde
    // "min or max is not a float", derrubando a página inteira.
    return await redis.zrange<string[]>(redisKeys.graduationDue(), SCORE_MIN, today, {
      byScore: true,
    });
  } catch (error) {
    // Leitura de painel: um erro aqui não pode zerar a tela do admin.
    console.error('[students] falha ao ler graduation:due', error);
    return [];
  }
}

/** Busca simples por nome, e-mail ou CPF, feita em memória sobre a lista ativa. */
export function filterStudents(
  students: readonly StudentRecord[],
  query: string,
): StudentRecord[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return [...students];

  const digits = term.replace(/\D/g, '');

  return students.filter((student) => {
    if (student.name.toLowerCase().includes(term)) return true;
    if (student.email.toLowerCase().includes(term)) return true;
    if (digits.length >= 3 && student.cpf.includes(digits)) return true;
    return false;
  });
}

/**
 * Apaga a ficha e tudo que pende dela no Redis. **Não tem desfazer.**
 *
 * Existe para a academia conseguir remover de verdade um cadastro — de teste ou
 * a pedido do aluno, que é o que a LGPD chama de direito ao esquecimento.
 * Inativar continua sendo o caminho de quem só parou de treinar: preserva
 * histórico e permite voltar.
 *
 * O arquivo no Blob e a conta no Clerk são apagados por quem chama, porque
 * dependem de serviços externos a este módulo.
 *
 * **Órfãos aceitos de propósito:** as entradas em `rank:month:*` e
 * `rank:belt:*:month:*` não são varridas. Seriam uma chave por mês e por faixa
 * já usada, sem lista que as enumere. Não causam dano: a tela de ranking resolve
 * cada id para uma ficha e descarta quem não encontra, e essas chaves já expiram
 * sozinhas em 400 dias. O ranking geral e os por faixa, que não expiram, são
 * limpos aqui.
 */
export async function deleteStudent(student: StudentRecord): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const tx = redis.multi();

  tx.del(redisKeys.user(student.id));
  tx.del(redisKeys.payment(student.id));
  tx.del(redisKeys.paymentsHistory(student.id));
  tx.del(redisKeys.checkins(student.id));
  tx.del(redisKeys.graduationHistory(student.id));

  tx.srem('users:index', student.id);
  // Todos os status, não só o atual: uma ficha que trocou de fila no passado
  // pode ter deixado rastro se alguma gravação falhou pela metade.
  for (const status of USER_STATUSES) {
    tx.srem(redisKeys.usersByStatus(status), student.id);
  }

  // O vínculo some junto: dependente apagado não pode continuar aparecendo
  // no seletor de perfil do responsável.
  if (student.guardianUserId) {
    tx.srem(redisKeys.dependents(student.guardianUserId), student.id);
  }

  tx.zrem(redisKeys.graduationDue(), student.id);
  tx.zrem(redisKeys.paymentsDue(), student.id);
  tx.zrem(redisKeys.rankAll(), student.id);

  // Faixas são lista fechada e curta; varrer todas cobre as que o aluno já
  // teve, não só a atual.
  for (const belt of BELT_IDS) {
    tx.zrem(redisKeys.rankBelt(belt), student.id);
  }

  await tx.exec();
}

/* -------------------------------------------------------------------------- */
/* Dependentes: a ficha de quem não tem login próprio                         */
/* -------------------------------------------------------------------------- */

/**
 * Id de uma ficha sem conta no Clerk.
 *
 * O prefixo não é enfeite: em toda a aplicação `id` de aluno é id do Clerk, e
 * `dep_` é o que permite olhar um id e saber que aquela ficha não tem login —
 * sem ir ao banco perguntar. É o que impede, por exemplo, tentar apagar uma
 * conta do Clerk que nunca existiu.
 */
export function isDependentId(id: string): boolean {
  return id.startsWith('dep_');
}

function newDependentId(): string {
  // 12 bytes em base36: espaço de colisão muito acima do número de alunos que
  // qualquer academia vai ter, e curto o bastante para caber numa URL.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const sufixo = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
  return `dep_${sufixo}`;
}

/**
 * Cria a ficha de um dependente pendurada numa conta.
 *
 * Ela entra na fila de aprovação como qualquer outra: turma, faixa e
 * mensalidade continuam sendo decisão de quem administra. O que muda é que
 * não há login para criar, e o responsável já vem preenchido a partir da
 * ficha de quem cadastrou.
 */
export async function createDependent(
  guardianUserId: string,
  input: Omit<
    Parameters<typeof createPendingStudent>[0],
    'id' | 'guardianUserId'
  >,
  now: Date,
): Promise<StudentRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const student = await createPendingStudent(
    { ...input, id: newDependentId(), guardianUserId },
    now,
  );

  await redis.sadd(redisKeys.dependents(guardianUserId), student.id);
  return student;
}

/**
 * Pendura numa conta a ficha de quem **já** treina.
 *
 * `createDependent` serve para quem ainda não existe. Este é o caso mais
 * comum numa academia que já roda há anos: a criança foi matriculada na
 * recepção muito antes de o pai ter conta no site, e agora ele quer ver a
 * frequência dela sem decorar um segundo login. Nada no histórico muda — a
 * ficha é a mesma, com as presenças, os graus e a mensalidade dela.
 *
 * Isto é concessão de acesso, não cadastro: quem ganha o vínculo passa a ver
 * a ficha inteira e a marcar presença por aquele aluno. Por isso a decisão é
 * da gestão, e por isso as recusas aqui são explícitas em vez de silenciosas.
 */
export type LinkResult =
  | { readonly ok: true; readonly student: StudentRecord }
  | { readonly ok: false; readonly message: string };

export async function linkDependent(
  student: StudentRecord,
  guardian: StudentRecord,
  now: Date,
): Promise<LinkResult> {
  const redis = getRedis();
  if (!redis) return { ok: false, message: 'Banco de dados não configurado.' };

  if (student.id === guardian.id) {
    return { ok: false, message: 'Uma ficha não pode ser dependente de si mesma.' };
  }

  // Vínculo não encadeia. Com A → B → C, trocar de perfil ficaria ambíguo e
  // o dono de A acabaria vendo C sem ninguém ter decidido isso.
  if (guardian.guardianUserId !== null) {
    return {
      ok: false,
      message: `${guardian.name} não tem login próprio — a ficha dele já é administrada por outra conta.`,
    };
  }

  // O responsável precisa ter conta no Clerk: é a conta que vai assumir o
  // perfil. Uma ficha `dep_` não tem login para onde apontar.
  if (isDependentId(guardian.id)) {
    return {
      ok: false,
      message: `${guardian.name} não tem conta no site. O responsável precisa se cadastrar primeiro.`,
    };
  }

  if (student.guardianUserId === guardian.id) {
    return { ok: false, message: `Já está vinculado a ${guardian.name}.` };
  }

  const anterior = student.guardianUserId;

  const atualizado: StudentRecord = {
    ...student,
    guardianUserId: guardian.id,
    updatedAt: now.toISOString(),
  };

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), studentToRow(atualizado));
  tx.sadd(redisKeys.dependents(guardian.id), student.id);
  // Trocar de responsável tem de limpar o anterior, ou a ficha apareceria no
  // seletor de perfil das duas contas.
  if (anterior && anterior !== guardian.id) {
    tx.srem(redisKeys.dependents(anterior), student.id);
  }
  await tx.exec();

  return { ok: true, student: atualizado };
}

/**
 * Desfaz o vínculo.
 *
 * A ficha continua existindo e continua treinando; o que ela perde é a conta
 * que a enxergava. Para a ficha sem login próprio isto a deixa sem ninguém
 * que a acesse pelo site — o que é aceitável e às vezes é o ponto: o aluno
 * fez 18 anos e vai abrir a conta dele.
 */
export async function unlinkDependent(
  student: StudentRecord,
  now: Date,
): Promise<StudentRecord> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  const atualizado: StudentRecord = {
    ...student,
    guardianUserId: null,
    updatedAt: now.toISOString(),
  };

  const tx = redis.multi();
  tx.hset(redisKeys.user(student.id), studentToRow(atualizado));
  if (student.guardianUserId) {
    tx.srem(redisKeys.dependents(student.guardianUserId), student.id);
  }
  await tx.exec();

  return atualizado;
}

/** Ids das fichas que esta conta administra, sem a dela própria. */
export async function listDependentIds(guardianUserId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  const ids = await redis.smembers<string[]>(redisKeys.dependents(guardianUserId));
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

/**
 * As fichas que esta conta administra, já carregadas.
 *
 * Confere o `guardianUserId` de cada uma contra a conta: o índice é um set
 * que pode ficar desatualizado se uma gravação falhar pela metade, e dali sai
 * a lista de perfis que a pessoa pode assumir. Index desalinhado não pode
 * virar acesso à ficha de outro.
 */
export async function listDependents(guardianUserId: string): Promise<StudentRecord[]> {
  const ids = await listDependentIds(guardianUserId);
  if (ids.length === 0) return [];

  const fichas = await getStudents(ids);
  return fichas
    .filter((student) => student.guardianUserId === guardianUserId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export { rowToStudent, studentToRow, isRecord };
