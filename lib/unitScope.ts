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

/*
 * O prefixo `__Host-` é uma trava que o navegador impõe, não o servidor: ele
 * só aceita o cookie se vier por HTTPS, com `path=/` e **sem** `Domain`. Isso
 * impede que um subdomínio qualquer da academia — um painel de terceiro, um
 * site de evento — grave um cookie que o painel principal depois leria.
 *
 * Em desenvolvimento o prefixo não vale (não há HTTPS), e o nome sem prefixo é
 * usado. São nomes diferentes, então a leitura tenta os dois: um cookie
 * gravado antes desta mudança continua valendo até o professor trocar de
 * unidade uma vez.
 */
const COOKIE_SEGURO = '__Host-sabino_unidade';
const COOKIE_SIMPLES = 'sabino_unidade';
const UM_ANO = 60 * 60 * 24 * 365;

const emProducao = (): boolean => process.env.NODE_ENV === 'production';
const nomeDoCookie = (): string => (emProducao() ? COOKIE_SEGURO : COOKIE_SIMPLES);

export async function getUnitScope(): Promise<UnitScope> {
  const store = await cookies();
  const valor = store.get(nomeDoCookie())?.value ?? store.get(COOKIE_SIMPLES)?.value;
  return toUnitScope(valor);
}

export async function setUnitScope(scope: UnitScope): Promise<void> {
  const store = await cookies();
  store.set(nomeDoCookie(), scope, {
    httpOnly: true,
    sameSite: 'lax',
    secure: emProducao(),
    path: '/',
    maxAge: UM_ANO,
  });
}
