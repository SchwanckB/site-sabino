/**
 * Livro-caixa da academia — Sabino Academia.
 *
 * O financeiro sabia só de entrada de mensalidade. Faltava tudo o mais: o
 * aluguel, a energia, o professor, o kimono vendido na recepção, a taxa de
 * matrícula. Sem isso o fechamento do mês respondia "entrou R$ X" e nunca
 * "sobrou R$ Y" — que é a pergunta que paga as contas.
 *
 * Receita e despesa são o **mesmo** lançamento com sinal diferente, de
 * propósito: a tela, a validação, a listagem e a exportação são idênticas, e
 * manter dois módulos quase iguais só multiplicaria o lugar onde esquecer uma
 * regra. O que distingue é `kind` e a lista de categorias de cada um.
 *
 * A mensalidade **não** entra aqui. Ela já tem motor, índice de cobrança e
 * histórico próprios; duplicá-la no caixa criaria duas verdades sobre o mesmo
 * dinheiro. O fechamento do mês soma as duas fontes na hora de apresentar.
 *
 * Funções puras, sem I/O. Valores sempre em centavos inteiros.
 */

/** Receita ou despesa. */
export type CashKind = 'receita' | 'despesa';

export const CASH_KINDS: readonly CashKind[] = ['receita', 'despesa'];

export function isCashKind(value: unknown): value is CashKind {
  return value === 'receita' || value === 'despesa';
}

/**
 * Categorias de despesa.
 *
 * Lista fechada, e não texto livre: é o que permite somar por categoria e
 * responder "quanto gastei de energia este ano". Texto livre viraria
 * "Energia", "energia", "luz" e "CEEE" na mesma coluna.
 */
export const EXPENSE_CATEGORIES = [
  'aluguel',
  'energia',
  'agua',
  'internet',
  'professor',
  'material',
  'limpeza',
  'manutencao',
  'imposto',
  'marketing',
  'evento',
  'outro',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> = {
  aluguel: 'Aluguel',
  energia: 'Energia',
  agua: 'Água',
  internet: 'Internet e telefone',
  professor: 'Professor e equipe',
  material: 'Material e tatame',
  limpeza: 'Limpeza',
  manutencao: 'Manutenção',
  imposto: 'Imposto e taxas',
  marketing: 'Divulgação',
  evento: 'Evento e competição',
  outro: 'Outro',
};

/** Categorias de receita que não são mensalidade. */
export const INCOME_CATEGORIES = [
  'matricula',
  'kimono',
  'faixa',
  'camiseta',
  'evento',
  'aluguel_espaco',
  'outro',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const INCOME_CATEGORY_LABELS: Readonly<Record<IncomeCategory, string>> = {
  matricula: 'Taxa de matrícula',
  kimono: 'Kimono',
  faixa: 'Faixa',
  camiseta: 'Camiseta e material',
  evento: 'Evento e seminário',
  aluguel_espaco: 'Aluguel do espaço',
  outro: 'Outro',
};

/** Rótulo de qualquer categoria, de receita ou de despesa. */
export function categoryLabel(kind: CashKind, category: string): string {
  const table: Readonly<Record<string, string>> =
    kind === 'despesa' ? EXPENSE_CATEGORY_LABELS : INCOME_CATEGORY_LABELS;
  return table[category] ?? category;
}

/** Categorias válidas para um tipo de lançamento. */
export function categoriesFor(kind: CashKind): readonly string[] {
  return kind === 'despesa' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
}

/** `true` se a categoria existe para aquele tipo. */
export function isValidCategory(kind: CashKind, category: string): boolean {
  return categoriesFor(kind).includes(category);
}

/** Um lançamento do caixa, do jeito que o resumo precisa vê-lo. */
export interface CashItem {
  readonly kind: CashKind;
  /** `YYYY-MM-DD` do dia em que o dinheiro entrou ou saiu. */
  readonly date: string;
  readonly amountCents: number;
  readonly category: string;
}

export interface CategoryTotal {
  readonly category: string;
  readonly label: string;
  readonly cents: number;
}

export interface CashbookSummary {
  /** `YYYY-MM`. */
  readonly month: string;
  /** Receita lançada no caixa — **sem** as mensalidades. */
  readonly incomeCents: number;
  readonly expenseCents: number;
  /** Mensalidades recebidas no mês, somadas de fora. */
  readonly tuitionCents: number;
  /** Tudo que entrou: mensalidade + outras receitas. */
  readonly totalInCents: number;
  /** Entrou menos saiu. Negativo é mês no vermelho. */
  readonly resultCents: number;
  readonly byExpenseCategory: readonly CategoryTotal[];
  readonly byIncomeCategory: readonly CategoryTotal[];
  readonly entryCount: number;
}

function totalsByCategory(
  items: readonly CashItem[],
  kind: CashKind,
): CategoryTotal[] {
  const map = new Map<string, number>();

  for (const item of items) {
    if (item.kind !== kind) continue;
    map.set(item.category, (map.get(item.category) ?? 0) + item.amountCents);
  }

  return [...map.entries()]
    .map(([category, cents]) => ({ category, label: categoryLabel(kind, category), cents }))
    .sort((a, b) => b.cents - a.cents);
}

/**
 * Fecha o mês: o que entrou de mensalidade, o que entrou de resto, o que saiu
 * e quanto sobrou.
 *
 * A mensalidade chega pronta em `tuitionCents` porque vem de outra fonte — o
 * histórico de pagamentos do aluno. Misturar as duas origens dentro desta
 * função exigiria que ela conhecesse o motor de mensalidade, e o caixa deixaria
 * de ser testável sozinho.
 */
export function summarizeCashbook(
  items: readonly CashItem[],
  month: string,
  tuitionCents: number,
): CashbookSummary {
  const doMes = items.filter((item) => item.date.slice(0, 7) === month);

  const incomeCents = doMes
    .filter((item) => item.kind === 'receita')
    .reduce((soma, item) => soma + item.amountCents, 0);

  const expenseCents = doMes
    .filter((item) => item.kind === 'despesa')
    .reduce((soma, item) => soma + item.amountCents, 0);

  const tuition = Math.max(0, Math.trunc(tuitionCents));
  const totalInCents = tuition + incomeCents;

  return {
    month,
    incomeCents,
    expenseCents,
    tuitionCents: tuition,
    totalInCents,
    resultCents: totalInCents - expenseCents,
    byExpenseCategory: totalsByCategory(doMes, 'despesa'),
    byIncomeCategory: totalsByCategory(doMes, 'receita'),
    entryCount: doMes.length,
  };
}

/**
 * Margem do mês, de 0 a 100 — quanto do que entrou sobrou.
 *
 * `null` em mês sem entrada: dividir por zero daria `Infinity`, e uma margem
 * inventada é pior que nenhuma.
 */
export function marginPercent(summary: CashbookSummary): number | null {
  if (summary.totalInCents <= 0) return null;
  return Math.round((summary.resultCents / summary.totalInCents) * 100);
}
