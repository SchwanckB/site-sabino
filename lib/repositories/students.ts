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
  USER_STATUSES,
  type Category,
  type PublicStudent,
  type StudentRecord,
  type UserStatus,
} from '@/types/domain';
import { maskCpf } from '@/utils/cpf';
import { saoPauloDateString } from '@/utils/datetime';
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

  return {
    id,
    name: asString(row['name']),
    email: asString(row['email']),
    phone: asString(row['phone']),
    cpf: asString(row['cpf']),
    birthDate: asString(row['birthDate']),
    status,
    category,
    belt: asString(row['belt'], 'branca'),
    degree: asInteger(row['degree'], 0),
    guardianName: asNullableString(row['guardianName']),
    guardianPhone: asNullableString(row['guardianPhone']),
    guardianCpf: asNullableString(row['guardianCpf']),
    joinedAt: asNullableString(row['joinedAt']),
    lastGraduationAt: asNullableString(row['lastGraduationAt']),
    docBlobKey: asNullableString(row['docBlobKey']),
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
    belt: student.belt,
    degree: student.degree,
    guardianName: student.guardianName ?? '',
    guardianPhone: student.guardianPhone ?? '',
    guardianCpf: student.guardianCpf ?? '',
    joinedAt: student.joinedAt ?? '',
    lastGraduationAt: student.lastGraduationAt ?? '',
    docBlobKey: student.docBlobKey ?? '',
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
    belt: student.belt,
    degree: student.degree,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    joinedAt: student.joinedAt,
    lastGraduationAt: student.lastGraduationAt,
    hasDocument: student.docBlobKey !== null,
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
  input: Omit<StudentRecord, 'status' | 'createdAt' | 'updatedAt' | 'joinedAt' | 'lastGraduationAt' | 'classIds' | 'rejectionReason' | 'notes' | 'degree' | 'category'> & {
    readonly degree?: number;
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
    degree: input.degree ?? 0,
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
    } else if (typeof value === 'string' || typeof value === 'number') {
      row[key] = value;
    }
  }

  await redis.hset(redisKeys.user(id), row);
}

export interface ApprovalInput {
  readonly classIds: readonly string[];
  readonly belt: string;
  readonly degree: number;
  readonly notes: string;
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
  return redis.zrange<string[]>(redisKeys.graduationDue(), Number.NEGATIVE_INFINITY, today, {
    byScore: true,
  });
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

export { rowToStudent, studentToRow, isRecord };
