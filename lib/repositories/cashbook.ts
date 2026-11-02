import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asInteger, asString, isRecord } from '@/lib/repositories/parse';
import { isUnitId, type UnitId } from '@/types/domain';
import { saoPauloDateString } from '@/utils/datetime';
import { isCashKind, isValidCategory, type CashKind } from '@/utils/cashbook';

/**
 * Livro-caixa (`cash:entries:{YYYY-MM}`, `cash:recurring`, `cash:closed`).
 *
 * Guardado **por mês** de propósito. O caixa é sempre consultado por mês — é
 * assim que o professor fecha, confere e compara — e uma chave por mês mantém
 * a leitura do mês corrente barata para sempre, mesmo depois de anos de
 * lançamento. O preço é uma leitura por mês quando se olha vários, que é
 * exatamente o que a previsão e o comparativo precisam.
 *
 * Três chaves, três responsabilidades:
 *
 *  - `cash:entries:{mês}` — o que entrou e saiu naquele mês;
 *  - `cash:recurring`     — as contas fixas, como modelo. Não são lançamentos:
 *                           viram lançamento quando o professor manda lançar
 *                           o mês. Sem isso seria preciso um agendador, e um
 *                           agendador que falha em silêncio é pior que um
 *                           botão;
 *  - `cash:closed`        — meses fechados, que não aceitam mais lançamento.
 *
 * Mensalidade não mora aqui: ela tem motor e histórico próprios, e duplicá-la
 * criaria duas verdades sobre o mesmo dinheiro.
 */

export interface CashEntry {
  readonly id: string;
  readonly kind: CashKind;
  /** `YYYY-MM-DD` do dia em que o dinheiro entrou ou saiu. */
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
  readonly description: string;
  /** Unidade, ou `rede` para o que é da academia toda (contador, anúncio). */
  readonly unit: UnitId | 'rede';
  /** Quem lançou — para a conferência de quem fechou o mês. */
  readonly registeredBy: string;
  readonly createdAt: string;
}

export interface RecurringCost {
  readonly id: string;
  readonly kind: CashKind;
  readonly amountCents: number;
  readonly category: string;
  readonly description: string;
  readonly unit: UnitId | 'rede';
  /** Dia do mês em que costuma cair (1 a 31). */
  readonly dueDay: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const MAX_PER_MONTH = 500;
const MAX_RECURRING = 60;
const MAX_DESCRIPTION = 120;

/** Teto de um lançamento: R$ 1.000.000,00. Barra dígito a mais por engano. */
const MAX_CENTS = 100_000_000;

export function isMonth(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

function toUnitOrNetwork(value: unknown): UnitId | 'rede' {
  if (value === 'rede') return 'rede';
  return isUnitId(value) ? value : 'rede';
}

function parseEntry(value: unknown): CashEntry | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const kind = asString(value['kind']);
  const date = asString(value['date']);
  const amountCents = asInteger(value['amountCents'], 0);
  const category = asString(value['category']);

  if (id.length === 0 || !isCashKind(kind) || !DATE_PATTERN.test(date)) return null;
  if (amountCents <= 0) return null;

  return {
    id,
    kind,
    date,
    amountCents,
    category,
    description: asString(value['description']).slice(0, MAX_DESCRIPTION),
    unit: toUnitOrNetwork(value['unit']),
    registeredBy: asString(value['registeredBy']),
    createdAt: asString(value['createdAt']),
  };
}

function parseRecurring(value: unknown): RecurringCost | null {
  if (!isRecord(value)) return null;

  const id = asString(value['id']);
  const kind = asString(value['kind']);
  const amountCents = asInteger(value['amountCents'], 0);

  if (id.length === 0 || !isCashKind(kind) || amountCents <= 0) return null;

  return {
    id,
    kind,
    amountCents,
    category: asString(value['category']),
    description: asString(value['description']).slice(0, MAX_DESCRIPTION),
    unit: toUnitOrNetwork(value['unit']),
    dueDay: Math.min(Math.max(asInteger(value['dueDay'], 1), 1), 31),
  };
}

/* -------------------------------------------------------------------------- */
/* Lançamentos do mês                                                         */
/* -------------------------------------------------------------------------- */

/** Lançamentos de um mês, do mais recente para o mais antigo. */
export async function listCashEntries(month: string): Promise<CashEntry[]> {
  const redis = getRedis();
  if (!redis || !isMonth(month)) return [];

  try {
    const raw = await redis.get<unknown>(redisKeys.cashEntries(month));
    const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw['entries'] : null;
    if (!Array.isArray(list)) return [];

    const entries: CashEntry[] = [];
    for (const item of list) {
      const parsed = parseEntry(item);
      if (parsed) entries.push(parsed);
    }

    return entries.sort((a, b) =>
      a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt.localeCompare(a.createdAt),
    );
  } catch (error) {
    // Um mês ilegível não pode derrubar a tela do caixa — o professor precisa
    // conseguir lançar hoje mesmo que o arquivo de março esteja torto.
    console.error(`[cashbook] falha ao ler cash:entries:${month}`, error);
    return [];
  }
}

/** Lançamentos de vários meses, para comparar e projetar. */
export async function listCashEntriesRange(
  months: readonly string[],
): Promise<CashEntry[]> {
  const listas = await Promise.all(months.filter(isMonth).map(listCashEntries));
  return listas.flat();
}

async function persistMonth(
  month: string,
  entries: readonly CashEntry[],
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.set(
    redisKeys.cashEntries(month),
    JSON.stringify({
      entries: entries.slice(0, MAX_PER_MONTH),
      updatedAt: now.toISOString(),
    }),
  );
}

export interface CashEntryInput {
  readonly id?: string;
  readonly kind: string;
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
  readonly description: string;
  readonly unit: string;
  readonly registeredBy: string;
}

export type CashValidation =
  | { readonly ok: true; readonly entry: CashEntry }
  | { readonly ok: false; readonly error: string };

export function validateCashEntry(input: CashEntryInput, now: Date): CashValidation {
  if (!isCashKind(input.kind)) {
    return { ok: false, error: 'Escolha se é uma entrada ou uma saída.' };
  }

  if (!DATE_PATTERN.test(input.date)) {
    return { ok: false, error: 'Escolha a data do lançamento.' };
  }

  // Lançar no futuro não é erro de digitação: é conta programada, e o caixa é
  // de dinheiro que entrou ou saiu. Quem quer prever usa a previsão.
  if (input.date > saoPauloDateString(now)) {
    return { ok: false, error: 'O caixa registra o que já aconteceu. A data não pode ser futura.' };
  }

  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Informe o valor do lançamento.' };
  }

  if (input.amountCents > MAX_CENTS) {
    return { ok: false, error: 'Valor acima do limite. Confira se não sobrou um dígito.' };
  }

  if (!isValidCategory(input.kind, input.category)) {
    return { ok: false, error: 'Escolha uma categoria da lista.' };
  }

  const description = input.description.trim();
  if (description.length < 2) {
    return { ok: false, error: 'Descreva o lançamento em poucas palavras.' };
  }

  return {
    ok: true,
    entry: {
      id:
        input.id && input.id.length > 0
          ? input.id
          : `cx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: input.kind,
      date: input.date,
      amountCents: Math.trunc(input.amountCents),
      category: input.category,
      description: description.slice(0, MAX_DESCRIPTION),
      unit: toUnitOrNetwork(input.unit),
      registeredBy: input.registeredBy,
      createdAt: now.toISOString(),
    },
  };
}

export async function upsertCashEntry(
  input: CashEntryInput,
  now: Date,
): Promise<CashValidation> {
  const validation = validateCashEntry(input, now);
  if (!validation.ok) return validation;

  const month = validation.entry.date.slice(0, 7);

  if (await isMonthClosed(month)) {
    return {
      ok: false,
      error: `${month} está fechado. Reabra o mês para lançar nele.`,
    };
  }

  const current = await listCashEntries(month);
  const index = current.findIndex((item) => item.id === validation.entry.id);

  const next =
    index >= 0
      ? current.map((item) => (item.id === validation.entry.id ? validation.entry : item))
      : [...current, validation.entry];

  await persistMonth(month, next, now);
  return validation;
}

export async function removeCashEntry(
  month: string,
  id: string,
  now: Date,
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  if (!isMonth(month)) return { ok: false, error: 'Mês inválido.' };

  if (await isMonthClosed(month)) {
    return { ok: false, error: `${month} está fechado. Reabra o mês para alterar.` };
  }

  const current = await listCashEntries(month);
  await persistMonth(
    month,
    current.filter((item) => item.id !== id),
    now,
  );

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Contas fixas                                                               */
/* -------------------------------------------------------------------------- */

export async function listRecurringCosts(): Promise<RecurringCost[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.get<unknown>(redisKeys.cashRecurring());
    const list = Array.isArray(raw) ? raw : isRecord(raw) ? raw['costs'] : null;
    if (!Array.isArray(list)) return [];

    const costs: RecurringCost[] = [];
    for (const item of list) {
      const parsed = parseRecurring(item);
      if (parsed) costs.push(parsed);
    }

    return costs.sort((a, b) => b.amountCents - a.amountCents);
  } catch (error) {
    console.error('[cashbook] falha ao ler cash:recurring', error);
    return [];
  }
}

export interface RecurringInput {
  readonly id?: string;
  readonly kind: string;
  readonly amountCents: number;
  readonly category: string;
  readonly description: string;
  readonly unit: string;
  readonly dueDay: number;
}

export type RecurringValidation =
  | { readonly ok: true; readonly cost: RecurringCost }
  | { readonly ok: false; readonly error: string };

export function validateRecurring(input: RecurringInput): RecurringValidation {
  if (!isCashKind(input.kind)) {
    return { ok: false, error: 'Escolha se é uma entrada ou uma saída.' };
  }
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: 'Informe o valor da conta fixa.' };
  }
  if (input.amountCents > MAX_CENTS) {
    return { ok: false, error: 'Valor acima do limite. Confira se não sobrou um dígito.' };
  }
  if (!isValidCategory(input.kind, input.category)) {
    return { ok: false, error: 'Escolha uma categoria da lista.' };
  }

  const description = input.description.trim();
  if (description.length < 2) {
    return { ok: false, error: 'Descreva a conta fixa em poucas palavras.' };
  }

  return {
    ok: true,
    cost: {
      id: input.id && input.id.length > 0 ? input.id : `fx-${Date.now().toString(36)}`,
      kind: input.kind,
      amountCents: Math.trunc(input.amountCents),
      category: input.category,
      description: description.slice(0, MAX_DESCRIPTION),
      unit: toUnitOrNetwork(input.unit),
      dueDay: Math.min(Math.max(Math.trunc(input.dueDay) || 1, 1), 31),
    },
  };
}

async function persistRecurring(
  costs: readonly RecurringCost[],
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.set(
    redisKeys.cashRecurring(),
    JSON.stringify({ costs: costs.slice(0, MAX_RECURRING), updatedAt: now.toISOString() }),
  );
}

export async function upsertRecurringCost(
  input: RecurringInput,
  now: Date,
): Promise<RecurringValidation> {
  const validation = validateRecurring(input);
  if (!validation.ok) return validation;

  const current = await listRecurringCosts();
  const index = current.findIndex((item) => item.id === validation.cost.id);

  await persistRecurring(
    index >= 0
      ? current.map((item) => (item.id === validation.cost.id ? validation.cost : item))
      : [...current, validation.cost],
    now,
  );

  return validation;
}

export async function removeRecurringCost(id: string, now: Date): Promise<void> {
  const current = await listRecurringCosts();
  await persistRecurring(
    current.filter((item) => item.id !== id),
    now,
  );
}

/**
 * Lança as contas fixas de um mês que ainda não foram lançadas.
 *
 * Idempotente pela descrição e pela categoria: rodar duas vezes no mesmo mês
 * não duplica o aluguel. É a propriedade que permite o professor clicar sem
 * medo quando não lembra se já lançou.
 *
 * O dia de cada conta é respeitado, mas nunca passa de hoje — lançar o
 * aluguel do dia 10 no dia 3 colocaria no caixa dinheiro que ainda não saiu.
 */
export async function postRecurringForMonth(
  month: string,
  registeredBy: string,
  now: Date,
): Promise<{ readonly posted: number; readonly skipped: number; readonly error?: string }> {
  if (!isMonth(month)) return { posted: 0, skipped: 0, error: 'Mês inválido.' };

  if (await isMonthClosed(month)) {
    return { posted: 0, skipped: 0, error: `${month} está fechado.` };
  }

  const [costs, existing] = await Promise.all([listRecurringCosts(), listCashEntries(month)]);
  if (costs.length === 0) {
    return { posted: 0, skipped: 0, error: 'Nenhuma conta fixa cadastrada.' };
  }

  const hoje = saoPauloDateString(now);
  const novos: CashEntry[] = [];
  let skipped = 0;

  for (const cost of costs) {
    const jaExiste = existing.some(
      (item) =>
        item.kind === cost.kind &&
        item.category === cost.category &&
        item.description.trim().toLowerCase() === cost.description.trim().toLowerCase(),
    );

    if (jaExiste) {
      skipped += 1;
      continue;
    }

    const dia = String(cost.dueDay).padStart(2, '0');
    const candidata = `${month}-${dia}`;
    // Dia 31 em mês curto, ou dia que ainda não chegou: cai em hoje.
    const date = !DATE_PATTERN.test(candidata) || candidata > hoje ? hoje : candidata;

    // Mês passado com conta fixa do dia 31 em fevereiro: a data cai em hoje,
    // que pode estar fora do mês. Nesse caso o lançamento não faz sentido.
    if (date.slice(0, 7) !== month) {
      skipped += 1;
      continue;
    }

    novos.push({
      id: `fx-${month}-${cost.id}`,
      kind: cost.kind,
      date,
      amountCents: cost.amountCents,
      category: cost.category,
      description: cost.description,
      unit: cost.unit,
      registeredBy,
      createdAt: now.toISOString(),
    });
  }

  if (novos.length > 0) {
    await persistMonth(month, [...existing, ...novos], now);
  }

  return { posted: novos.length, skipped };
}

/* -------------------------------------------------------------------------- */
/* Fechamento do mês                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Meses fechados.
 *
 * Fechar não é burocracia: é o que impede o número do mês passado de mudar
 * sozinho depois de ter sido usado para decidir algo. Enquanto todo mês aceita
 * lançamento retroativo, nenhuma comparação é confiável.
 */
export async function listClosedMonths(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.smembers(redisKeys.cashClosed());
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
  } catch (error) {
    console.error('[cashbook] falha ao ler cash:closed', error);
    return [];
  }
}

export async function isMonthClosed(month: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !isMonth(month)) return false;

  try {
    return (await redis.sismember(redisKeys.cashClosed(), month)) === 1;
  } catch (error) {
    // Na dúvida, deixa lançar: travar o caixa por falha de leitura seria
    // trocar um problema pequeno por um que impede o professor de trabalhar.
    console.error('[cashbook] falha ao conferir o fechamento', error);
    return false;
  }
}

export async function setMonthClosed(month: string, closed: boolean): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');
  if (!isMonth(month)) throw new Error('Mês inválido');

  if (closed) await redis.sadd(redisKeys.cashClosed(), month);
  else await redis.srem(redisKeys.cashClosed(), month);
}
