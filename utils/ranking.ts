/**
 * Ordenação do ranking de frequência.
 *
 * O Redis guarda a pontuação num sorted set, e com pontuação igual ele
 * desempata **pelo próprio id do membro**, em ordem lexicográfica. Na prática
 * isso significa que dois alunos com oito check-ins cada ficavam na ordem do
 * hash do Clerk: estável, mas arbitrária — e sem nada que o aluno possa
 * entender ou aceitar como justo.
 *
 * O desempate passa a ser a ordem de cadastro no app: entre dois empatados,
 * quem está na academia há mais tempo fica na frente. É a regra que dá para
 * explicar em voz alta no tatame.
 */

export interface Rankable {
  readonly userId: string;
  readonly score: number;
}

export interface Ranked<T> {
  readonly entry: T;
  readonly position: number;
}

/**
 * Ordena por pontuação (maior primeiro) e desempata por ordem de cadastro
 * (mais antigo primeiro).
 *
 * `registeredAt` devolve o `createdAt` do aluno, ou `null` quando a ficha não
 * foi encontrada. Sem data o aluno vai para o fim do empate: é o único lugar
 * onde ele não desloca ninguém que tem a informação.
 *
 * O id entra como terceiro critério e não é enfeite — sem ele, dois alunos
 * cadastrados no mesmo instante (a importação em lote grava todos com o mesmo
 * `createdAt`) ficariam na ordem de chegada do array, que muda entre leituras
 * e faria a lista trocar de ordem sozinha entre dois carregamentos.
 */
export function rankByScoreThenSeniority<T extends Rankable>(
  rows: readonly T[],
  registeredAt: (userId: string) => string | null,
): Ranked<T>[] {
  return [...rows]
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;

      const aAt = registeredAt(a.userId);
      const bAt = registeredAt(b.userId);

      // Sem data vai para o fim; as duas sem data caem no desempate por id.
      if (aAt === null && bAt !== null) return 1;
      if (bAt === null && aAt !== null) return -1;

      if (aAt !== null && bAt !== null && aAt !== bAt) {
        // ISO-8601 ordena como texto: o mais antigo é o menor.
        return aAt < bAt ? -1 : 1;
      }

      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    })
    .map((entry, index) => ({ entry, position: index + 1 }));
}
