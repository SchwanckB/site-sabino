/**
 * Linha do tempo da graduação, derivada do histórico já gravado.
 *
 * O banco guarda cada passo (`graduation:history:<id>`), mas sozinho isso é
 * uma lista de datas. O que o professor pergunta na hora da faixa é outra
 * coisa: *quanto tempo* o aluno levou em cada etapa e quanto já está na atual.
 * Função pura — recebe o histórico e `now`, devolve o que a tela mostra.
 */

import { daysBetween, saoPauloDateString } from './datetime';

export interface TimelineEntry {
  /** ISO do registro. */
  readonly at: string;
  readonly fromBelt: string;
  readonly fromDegree: number;
  readonly toBelt: string;
  readonly toDegree: number;
  /** `true` quando mudou de faixa, não apenas de grau. */
  readonly isBeltChange: boolean;
  /** Dias desde o passo anterior; `null` no primeiro registro. */
  readonly daysSincePrevious: number | null;
}

export interface BeltSpell {
  readonly belt: string;
  /** `YYYY-MM-DD` de quando entrou na faixa. */
  readonly from: string;
  /** `YYYY-MM-DD` de quando saiu, ou `null` se é a faixa atual. */
  readonly to: string | null;
  readonly days: number;
  readonly degreesEarned: number;
}

export interface Timeline {
  /** Do mais recente para o mais antigo, como a tela lista. */
  readonly entries: readonly TimelineEntry[];
  /** Tempo em cada faixa, da mais antiga para a atual. */
  readonly belts: readonly BeltSpell[];
  /** Dias desde a última graduação. */
  readonly daysSinceLast: number | null;
}

export interface HistoryEntry {
  readonly at: string;
  readonly fromBelt: string;
  readonly fromDegree: number;
  readonly toBelt: string;
  readonly toDegree: number;
}

/**
 * Monta a linha do tempo.
 *
 * `history` chega do mais recente para o mais antigo (é um LPUSH), e é assim
 * que a tela mostra. Os cálculos de intervalo, porém, precisam da ordem
 * cronológica — por isso a inversão interna.
 */
export function buildTimeline(
  history: readonly HistoryEntry[],
  joinedAt: string | null,
  now: Date,
): Timeline {
  const hoje = saoPauloDateString(now);

  const crescente = [...history].sort((a, b) => a.at.localeCompare(b.at));

  const entries: TimelineEntry[] = crescente.map((entry, index) => {
    const anterior = index > 0 ? crescente[index - 1] : undefined;
    const base = anterior?.at ?? joinedAt;

    return {
      at: entry.at,
      fromBelt: entry.fromBelt,
      fromDegree: entry.fromDegree,
      toBelt: entry.toBelt,
      toDegree: entry.toDegree,
      isBeltChange: entry.fromBelt !== entry.toBelt,
      daysSincePrevious: base ? diasEntre(base, entry.at) : null,
    };
  });

  const belts = montarFaixas(crescente, joinedAt, hoje);

  const ultimo = crescente[crescente.length - 1];
  const daysSinceLast = ultimo ? daysBetween(hoje, ultimo.at.slice(0, 10)) : null;

  // A tela lista do mais recente para o mais antigo.
  return { entries: [...entries].reverse(), belts, daysSinceLast };
}

/** Rótulo curto de duração: o professor pensa em meses, não em dias. */
export function formatSpan(days: number): string {
  if (days < 0) return '--';
  if (days < 45) return `${days} ${days === 1 ? 'dia' : 'dias'}`;

  const meses = Math.round(days / 30.44);
  if (meses < 18) return `${meses} meses`;

  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (resto === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos}a ${resto}m`;
}

/* -------------------------------------------------------------------------- */

function diasEntre(aIso: string, bIso: string): number {
  return Math.max(0, daysBetween(bIso.slice(0, 10), aIso.slice(0, 10)));
}

function montarFaixas(
  crescente: readonly HistoryEntry[],
  joinedAt: string | null,
  hoje: string,
): BeltSpell[] {
  const primeiro = crescente[0];
  if (!primeiro) return [];

  const faixas: BeltSpell[] = [];

  // A faixa inicial começa na matrícula, quando ela é conhecida.
  let faixaAtual = primeiro.fromBelt;
  let inicio = (joinedAt ?? primeiro.at).slice(0, 10);
  let graus = 0;

  for (const entry of crescente) {
    if (entry.toBelt === faixaAtual) {
      graus += 1;
      continue;
    }

    const fim = entry.at.slice(0, 10);
    faixas.push({
      belt: faixaAtual,
      from: inicio,
      to: fim,
      days: Math.max(0, daysBetween(fim, inicio)),
      degreesEarned: graus,
    });

    faixaAtual = entry.toBelt;
    inicio = fim;
    graus = 0;
  }

  faixas.push({
    belt: faixaAtual,
    from: inicio,
    to: null,
    days: Math.max(0, daysBetween(hoje, inicio)),
    degreesEarned: graus,
  });

  return faixas;
}
