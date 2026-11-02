import Link from 'next/link';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import type { AgeTransition, Birthday } from '@/utils/roster';

import { markFollowupAction } from './actions';

/**
 * Aniversariante com a conversa a um toque de distância.
 *
 * O link do WhatsApp é montado no servidor: a mensagem e a normalização do
 * telefone são funções puras e testadas, e assim a tela não precisa de
 * JavaScript para nada além do botão de "já parabenizei".
 */
export interface BirthdayRow extends Birthday {
  /** `null` quando não há telefone utilizável na ficha. */
  readonly whatsappUrl: string | null;
  /** `true` quando a mensagem vai para o responsável. */
  readonly toGuardian: boolean;
  readonly greeted: boolean;
}

/**
 * Dois avisos que o sistema sabe e o professor não tem como lembrar sozinho:
 * quem faz aniversário no mês e quem está saindo da trilha infantil.
 *
 * Componente de servidor — é só leitura, não precisa de JavaScript no cliente.
 */
export function Alertas({
  birthdays,
  transitions,
}: {
  readonly birthdays: readonly BirthdayRow[];
  readonly transitions: readonly AgeTransition[];
}) {
  if (birthdays.length === 0 && transitions.length === 0) return null;

  return (
    /*
      `min-w-0` nos cartões: `truncate` aplica `white-space: nowrap`, então um
      nome comprido vira o min-content do cartão e, num grid de coluna `auto`,
      estica a faixa inteira para além da tela. Com min-width zerado a faixa
      volta a seguir o container e o nome é que corta.
    */
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {birthdays.length > 0 ? (
        <section className="panel panel-pad min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="panel-title">Aniversariantes do mês</h2>
            <span className="shrink-0 text-xs tabular-nums text-muted">{birthdays.length}</span>
          </div>

          <ul className="mt-2 divide-y divide-hairline">
            {birthdays.map((item) => (
              <li key={item.id} className={cn('py-2', item.isPast && 'opacity-55')}>
                <div className="flex min-h-[44px] items-center gap-3 text-sm">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums',
                      item.isToday
                        ? 'bg-crimson text-foreground'
                        : 'border border-hairline bg-white/[.04] text-muted',
                    )}
                  >
                    {item.day}
                  </span>

                  <Link
                    href={`/admin/alunos/${item.id}`}
                    className="min-w-0 flex-1 truncate text-foreground hover:text-crimson"
                  >
                    {item.name}
                  </Link>

                  <span className="shrink-0 text-xs text-muted">
                    {item.isToday ? 'hoje · ' : ''}
                    {item.turning} anos
                  </span>
                </div>

                {/*
                  Parabenizar é das poucas coisas que o aluno comenta no
                  tatame, e era a que mais dependia da memória do professor:
                  a lista existia, a conversa não. Agora o texto já vai
                  escrito, e o que foi feito fica marcado — a lista some do
                  caminho em vez de repetir o ano inteiro.
                */}
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  {item.greeted ? (
                    <>
                      <span className="badge-ok">Parabenizado</span>
                      <ActionForm action={markFollowupAction}>
                        <input type="hidden" name="kind" value="aniversario" />
                        <input type="hidden" name="userId" value={item.id} />
                        <input type="hidden" name="undo" value="on" />
                        <SubmitButton className="btn-ghost px-1 text-[11px]" pendingLabel="…">
                          desmarcar
                        </SubmitButton>
                      </ActionForm>
                    </>
                  ) : item.whatsappUrl ? (
                    <>
                      <a
                        href={item.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost px-1 text-[11px] text-emerald-300"
                      >
                        Mandar parabéns
                        {item.toGuardian ? ' ao responsável' : ''}
                      </a>
                      <ActionForm action={markFollowupAction}>
                        <input type="hidden" name="kind" value="aniversario" />
                        <input type="hidden" name="userId" value={item.id} />
                        <SubmitButton className="btn-ghost px-1 text-[11px]" pendingLabel="…">
                          já parabenizei
                        </SubmitButton>
                      </ActionForm>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted">sem telefone na ficha</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {transitions.length > 0 ? (
        <section
          className={cn(
            'min-w-0 p-4 sm:p-5',
            transitions.some((t) => t.overdue) ? 'notice-late' : 'notice-warn',
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="panel-title">Saindo da trilha infantil</h2>
            <span
              title="Aos 16 anos o grau deixa de sair a cada 30 dias e o aluno passa para a faixa adulta."
              className="shrink-0 text-xs tabular-nums text-muted"
            >
              {transitions.length}
            </span>
          </div>

          <ul className="mt-2 divide-y divide-white/10">
            {transitions.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/alunos/${item.id}`}
                  className="group flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-foreground group-hover:text-crimson">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs',
                      item.overdue ? 'font-semibold text-crimson' : 'text-muted',
                    )}
                  >
                    {item.overdue
                      ? 'já fez 16 — migrar'
                      : item.daysUntil === 0
                        ? 'faz 16 hoje'
                        : `em ${item.daysUntil} ${item.daysUntil === 1 ? 'dia' : 'dias'}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
