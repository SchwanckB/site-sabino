/**
 * Substituto do pacote `server-only` durante os testes.
 *
 * Em produção aquele pacote quebra o build se um Client Component importar um
 * módulo de servidor — proteção que vale manter. No Vitest, porém, ele
 * impediria carregar os repositórios, que é justamente o que precisa ser
 * testado contra o banco.
 */
export {};
