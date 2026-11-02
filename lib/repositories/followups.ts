import 'server-only';

import { getRedis, redisKeys } from '@/lib/redis';
import { asString, isRecord } from '@/lib/repositories/parse';
import { daysBetween, saoPauloDateString } from '@/utils/datetime';

/**
 * Com quem o professor já falou, sobre o quê e quando (`followup:<assunto>`).
 *
 * As três listas de ação do painel — cobrar inadimplente, chamar quem sumiu,
 * parabenizar aniversariante — tinham o mesmo defeito: mostravam quem
 * precisava de contato, mas não guardavam que o contato aconteceu. Na segunda
 * vez que o professor abria a tela, a lista era idêntica, e ele não tinha como
 * saber se já havia ligado para aquela pessoa ontem.
 *
 * O registro é deliberadamente mínimo: um assunto, um aluno, uma data civil.
 * Não é histórico de conversa nem CRM — é só o suficiente para a lista parar
 * de repetir o que já foi feito.
 *
 * Cada assunto tem a sua noção de "já resolvido", porque o ritmo é diferente:
 * cobrança vale pelo mês de referência, retorno descansa quinze dias, e
 * aniversário vale pelo ano.
 */

export const FOLLOWUP_KINDS = ['cobranca', 'retorno', 'aniversario'] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export function isFollowupKind(value: unknown): value is FollowupKind {
  return typeof value === 'string' && (FOLLOWUP_KINDS as readonly string[]).includes(value);
}

/** Por quantos dias um contato de retorno silencia o aviso. */
export const RETORNO_SNOOZE_DAYS = 15;

/** Data civil (`YYYY-MM-DD`) do último contato, por aluno. */
export type FollowupMap = ReadonlyMap<string, string>;

const EMPTY: FollowupMap = new Map();

export async function listFollowups(kind: FollowupKind): Promise<FollowupMap> {
  const redis = getRedis();
  if (!redis) return EMPTY;

  try {
    const raw = await redis.hgetall<Record<string, unknown>>(redisKeys.followup(kind));
    if (!isRecord(raw)) return EMPTY;

    const map = new Map<string, string>();
    for (const [userId, value] of Object.entries(raw)) {
      const date = asString(value);
      if (date.length > 0) map.set(userId, date);
    }
    return map;
  } catch (error) {
    // Sem o registro, as listas voltam a mostrar todo mundo — chato, não
    // grave. Pior seria a tela de cobrança não abrir.
    console.error(`[followups] falha ao ler followup:${kind}`, error);
    return EMPTY;
  }
}

/** Anota que o contato aconteceu hoje. */
export async function markFollowup(
  kind: FollowupKind,
  userId: string,
  now: Date,
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.hset(redisKeys.followup(kind), {
    [userId]: saoPauloDateString(now),
  });
}

/** Desfaz a anotação — o aluno volta para a lista. */
export async function clearFollowup(kind: FollowupKind, userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Banco de dados não configurado');

  await redis.hdel(redisKeys.followup(kind), userId);
}

/* -------------------------------------------------------------------------- */
/* Regras de "já resolvido" — puras, uma por assunto                          */
/* -------------------------------------------------------------------------- */

/**
 * `true` se o aluno já foi cobrado pela parcela deste mês.
 *
 * A referência é o mês civil, e não uma quantidade de dias: a mensalidade é
 * mensal, e cobrar duas vezes a mesma parcela é o que irrita o aluno em dia
 * que esqueceu de mandar o comprovante.
 */
export function cobrancaFeitaNoMes(contato: string | undefined, today: string): boolean {
  return contato !== undefined && contato.slice(0, 7) === today.slice(0, 7);
}

/** `true` se o contato de retorno é recente demais para cobrar de novo. */
export function retornoRecente(contato: string | undefined, today: string): boolean {
  if (contato === undefined) return false;
  return daysBetween(today, contato) < RETORNO_SNOOZE_DAYS;
}

/** `true` se o aluno já foi parabenizado neste ano. */
export function parabensDadoNoAno(contato: string | undefined, today: string): boolean {
  return contato !== undefined && contato.slice(0, 4) === today.slice(0, 4);
}
