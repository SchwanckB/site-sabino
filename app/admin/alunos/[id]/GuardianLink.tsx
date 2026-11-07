'use client';

import { useMemo, useState } from 'react';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import { normalizeSearch } from '@/utils/searchText';

import { linkGuardianAction, unlinkGuardianAction } from '../../actions';

export interface GuardianCandidate {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

/**
 * A conta que acompanha esta ficha.
 *
 * O caso que trouxe isto: a academia já rodava há anos quando o site entrou.
 * A criança foi matriculada na recepção muito antes de o pai ter conta, e
 * agora ele quer ver a frequência dela — sem decorar um segundo login e sem
 * recadastrar ninguém. Vincular não mexe no histórico: a ficha é a mesma, com
 * as presenças, os graus e a mensalidade dela.
 *
 * O que o vínculo dá é acesso: a conta do responsável passa a ver a ficha
 * inteira e a marcar presença por aquele aluno. Por isso a tela diz isso em
 * voz alta antes de confirmar, e por isso a ação é da gestão.
 */
export function GuardianLink({
  studentId,
  studentName,
  hasOwnLogin,
  current,
  candidates,
}: {
  readonly studentId: string;
  readonly studentName: string;
  /** `false` para ficha `dep_`: sem vínculo, ninguém a acessa pelo site. */
  readonly hasOwnLogin: boolean;
  readonly current: { readonly id: string; readonly name: string } | null;
  readonly candidates: readonly GuardianCandidate[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  /*
   * A busca só devolve algo com duas letras.
   *
   * A lista inteira de alunos ativos num `select` é o caminho curto para
   * vincular a ficha à pessoa de nome parecido logo acima na ordem alfabética
   * — e isso dá a uma família acesso aos dados de outra.
   */
  const achados = useMemo(() => {
    const termo = normalizeSearch(search);
    if (termo.length < 2) return [];
    return candidates
      .filter((item) => normalizeSearch(`${item.name} ${item.email}`).includes(termo))
      .slice(0, 6);
  }, [candidates, search]);

  const primeiro = studentName.split(' ')[0] ?? studentName;

  return (
    <section className="panel mt-6 p-5 sm:p-6">
      <h2 className="text-lg normal-case tracking-normal">Conta que acompanha</h2>

      {current ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <span className="text-foreground">{current.name}</span> acompanha esta ficha e
            alterna entre os perfis no painel dele.
          </p>

          <ActionForm
            action={unlinkGuardianAction}
            className="mt-4"
            confirm={
              hasOwnLogin
                ? `Desfazer o vínculo de ${primeiro} com ${current.name}?`
                : `${primeiro} não tem login próprio. Sem o vínculo, nenhuma conta enxerga esta ficha. Desfazer mesmo assim?`
            }
          >
            <input type="hidden" name="studentId" value={studentId} />
            <SubmitButton className="btn-ghost text-xs" pendingLabel="Desfazendo…">
              Desfazer vínculo
            </SubmitButton>
          </ActionForm>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {hasOwnLogin
              ? `${primeiro} entra com a conta dele. Vincule a um responsável se alguém da família também precisa acompanhar.`
              : `${primeiro} não tem login próprio. Vincule à conta de um responsável para a família acompanhar os treinos pelo site.`}
          </p>

          {open ? (
            <div className="mt-4 border-t border-hairline pt-4">
              <label className="block">
                <span className="block text-xs text-muted">
                  Buscar o responsável por nome ou e-mail
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  autoComplete="off"
                  placeholder="Ex.: Eloy"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-hairline bg-white/[.04] px-3 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none"
                />
              </label>

              {achados.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {achados.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-hairline bg-white/[.03] p-3"
                    >
                      <ActionForm
                        action={linkGuardianAction}
                        confirm={`${item.name} vai ver a ficha inteira de ${primeiro} — treinos, graduação e mensalidade — e poderá marcar presença por ele. Vincular?`}
                      >
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="guardianId" value={item.id} />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {item.name}
                            </p>
                            <p className="truncate text-xs text-muted">{item.email}</p>
                          </div>
                          <SubmitButton className="btn-primary text-xs" pendingLabel="…">
                            Vincular
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  {normalizeSearch(search).length < 2
                    ? 'Digite ao menos duas letras.'
                    : 'Nenhuma conta com esse nome. O responsável precisa ter cadastro ativo nesta academia.'}
                </p>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost mt-3 text-xs"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn('btn-secondary mt-4 text-sm')}
            >
              Vincular a um responsável
            </button>
          )}
        </>
      )}
    </section>
  );
}
