import 'server-only';

import { getRedis } from '@/lib/redis';

/**
 * Registro de ações do professor que alteram ou apagam dado de aluno.
 *
 * Existe por causa de uma assimetria: `registerPayment` guardava
 * `registeredBy`, mas desfazer pagamento, desfazer grau e remover presença não
 * guardavam nada. Quem desfez, quando e de qual aluno — nada disso ficava
 * gravado. Numa academia com mais de um professor, "o pagamento do meu filho
 * desapareceu" não tinha resposta possível.
 *
 * É só trilha de auditoria, nunca fonte de verdade: nada no app lê isto para
 * decidir comportamento, e por isso a falha de gravação é registrada em log e
 * engolida — perder a trilha é ruim, mas impedir o professor de corrigir um
 * lançamento errado é pior.
 *
 * Lista aparada em `MAX_ENTRIES` e com validade de um ano. Não é contabilidade;
 * é memória suficiente para reconstituir uma confusão recente.
 */

const KEY = 'audit:admin';
const MAX_ENTRIES = 2000;
const TTL_SECONDS = 60 * 60 * 24 * 365;

/** Ações registradas. Nomes estáveis — aparecem nos dados gravados. */
export type AuditAction =
  | 'aluno.aprovado'
  | 'aluno.recusado'
  | 'aluno.status'
  /** Exclusão definitiva: ficha, histórico, arquivo e login. */
  | 'aluno.apagado'
  | 'pagamento.desfeito'
  | 'graduacao.desfeita'
  | 'presenca.removida'
  | 'papel.alterado';

export interface AuditEntry {
  readonly at: string;
  readonly action: AuditAction;
  /** Quem executou. */
  readonly byId: string;
  readonly byName: string;
  /** Aluno ou conta afetada. */
  readonly targetId: string;
  readonly targetName: string;
  /** Contexto curto e legível: valor desfeito, data, motivo. */
  readonly detail: string;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const tx = redis.multi();
    tx.lpush(KEY, JSON.stringify(entry));
    tx.ltrim(KEY, 0, MAX_ENTRIES - 1);
    tx.expire(KEY, TTL_SECONDS);
    await tx.exec();
  } catch (error) {
    console.error('[audit] falha ao registrar', entry.action, error);
  }
}

/** Histórico, do mais recente para o mais antigo. */
export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const raw = await redis.lrange<unknown>(KEY, 0, limit - 1);

    const entries: AuditEntry[] = [];
    for (const item of raw) {
      const parsed = typeof item === 'string' ? safeParse(item) : item;
      if (parsed && typeof parsed === 'object') {
        entries.push(parsed as AuditEntry);
      }
    }
    return entries;
  } catch (error) {
    console.error('[audit] falha ao listar', error);
    return [];
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
