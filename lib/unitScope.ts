import 'server-only';

import { cookies } from 'next/headers';

import { toUnitScope, type UnitScope } from '@/types/domain';

/**
 * Qual academia o painel está mostrando.
 *
 * Guardado em cookie, e não na URL: o professor escolhe a unidade uma vez e
 * ela vale enquanto ele navega entre alunos, financeiro e chamada. Colocar na
 * URL obrigaria a carregar o parâmetro em cada link do menu, e um link
 * copiado levaria a outra academia sem avisar.
 *
 * O cookie só carrega um rótulo de recorte — não é credencial e não decide
 * permissão. Quem pode ver o painel já passou por `requireAdmin()`.
 */

const COOKIE = 'sabino_unidade';
const UM_ANO = 60 * 60 * 24 * 365;

export async function getUnitScope(): Promise<UnitScope> {
  const store = await cookies();
  return toUnitScope(store.get(COOKIE)?.value);
}

export async function setUnitScope(scope: UnitScope): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, scope, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: UM_ANO,
  });
}
