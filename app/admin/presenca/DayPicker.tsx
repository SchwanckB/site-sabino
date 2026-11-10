import Link from 'next/link';

import { cn } from '@/lib/utils';
import { addDays, formatBr } from '@/utils/datetime';

/**
 * Escolha do dia da chamada.
 *
 * Antes isto vivia dentro de um `<details>` fechado, com resumo em cinza de
 * 12px, abaixo da grade de turmas. Acertar a chamada de ontem custava: achar o
 * link minúsculo, expandir, abrir o seletor de data do sistema, escolher,
 * enviar, esperar o recarregamento — e só então escolher a turma. Seis passos
 * para a tarefa que é o motivo de a tela existir.
 *
 * O dia agora é a primeira coisa da tela. E como na prática o professor está
 * quase sempre consertando a chamada de ontem ou de anteontem — não de uma
 * data qualquer —, esses dois viram um toque só. O seletor de data continua
 * ali, para o resto.
 *
 * `turma` viaja junto nos atalhos: trocar o dia com uma turma já escolhida
 * perdia a escolha e devolvia a pessoa para a grade.
 */
export function DayPicker({
  dia,
  hoje,
  minDate,
  turma,
}: {
  /** Dia sendo visto, `YYYY-MM-DD`. */
  readonly dia: string;
  readonly hoje: string;
  /** Alcance da trava de retroatividade. */
  readonly minDate: string;
  /** Turma escolhida, para não se perder na troca de dia. */
  readonly turma?: string | undefined;
}) {
  const ontem = addDays(hoje, -1);
  const anteontem = addDays(hoje, -2);

  const atalhos = [
    { value: hoje, label: 'Hoje' },
    { value: ontem, label: 'Ontem' },
    { value: anteontem, label: formatBr(anteontem).slice(0, 5) },
  ].filter((atalho) => atalho.value >= minDate);

  const href = (value: string): string => {
    const params = new URLSearchParams();
    // `hoje` é o padrão da página: sem o parâmetro a URL fica limpa.
    if (value !== hoje) params.set('dia', value);
    if (turma) params.set('turma', turma);
    const qs = params.toString();
    return qs.length > 0 ? `/admin/presenca?${qs}` : '/admin/presenca';
  };

  return (
    <div className="toolbar">
      <span className="stat-label shrink-0">Chamada de</span>

      <div className="flex flex-wrap items-center gap-1.5">
        {atalhos.map((atalho) => {
          const ativo = atalho.value === dia;

          return (
            <Link
              key={atalho.value}
              href={href(atalho.value)}
              aria-current={ativo ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-[36px] items-center rounded-lg border px-3 text-sm font-medium transition-colors',
                ativo
                  ? 'border-crimson/60 bg-crimson/[.12] text-foreground'
                  : 'border-hairline bg-white/[.03] text-muted hover:text-foreground',
              )}
            >
              {atalho.label}
            </Link>
          );
        })}

        {/*
          Qualquer outra data. `method="get"` de propósito: a tela inteira é
          derivada da URL, então a navegação já é o estado — não há o que
          guardar no cliente.
        */}
        <form method="get" className="flex items-center gap-1.5">
          {turma ? <input type="hidden" name="turma" value={turma} /> : null}

          <label className="sr-only" htmlFor="dia-chamada">
            Outro dia
          </label>
          <input
            id="dia-chamada"
            type="date"
            name="dia"
            defaultValue={dia}
            max={hoje}
            min={minDate}
            className="min-h-[36px] rounded-lg border border-hairline bg-white/[.03] px-2.5 text-sm text-foreground focus:border-crimson focus:outline-none"
          />
          <button type="submit" className="btn-secondary min-h-[36px] px-3 text-xs">
            Ver
          </button>
        </form>
      </div>

      {/*
        Aviso de retroatividade na mesma linha do controle que o causou. Numa
        faixa separada, a pessoa já tinha rolado para longe quando lia.
      */}
      {dia !== hoje ? (
        <span className="badge-warn ml-auto">Registrando em {formatBr(dia)}</span>
      ) : null}
    </div>
  );
}
