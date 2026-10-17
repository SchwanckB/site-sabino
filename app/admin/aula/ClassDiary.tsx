'use client';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { formatBr } from '@/utils/datetime';

import { saveClassLogAction } from '../actions';

export interface DiaryEntry {
  readonly date: string;
  readonly text: string;
}

/**
 * Diário da aula.
 *
 * As últimas sessões ficam à vista enquanto o professor escreve a de hoje —
 * é assim que ele evita repetir a mesma técnica duas semanas seguidas, que é
 * o uso real disto.
 */
export function ClassDiary({
  classId,
  today,
  todayText,
  previous,
}: {
  readonly classId: string;
  /** `YYYY-MM-DD`. */
  readonly today: string;
  readonly todayText: string;
  readonly previous: readonly DiaryEntry[];
}) {
  return (
    <section className="panel panel-pad">
      <h2 className="panel-title">O que treinamos hoje</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Serve para não repetir a técnica na semana seguinte e para contar ao aluno o que ele
        perdeu quando faltou.
      </p>

      <ActionForm action={saveClassLogAction} className="mt-4">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="date" value={today} />

        <label htmlFor="class-log" className="sr-only">
          Técnicas treinadas hoje
        </label>
        <textarea
          id="class-log"
          name="text"
          rows={3}
          defaultValue={todayText}
          placeholder="Ex.: passagem de guarda em pé, finalização armlock da montada, 6 rounds de 5 min."
          className="w-full resize-y rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:border-crimson focus:outline-none"
        />

        <SubmitButton className="btn-secondary mt-3">
          {todayText.length > 0 ? 'Atualizar o dia' : 'Salvar'}
        </SubmitButton>
      </ActionForm>

      {previous.length > 0 ? (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-xs font-medium text-muted">Aulas anteriores</p>
          <ul className="mt-2 space-y-2.5">
            {previous.map((entry) => (
              <li key={entry.date} className="text-xs leading-relaxed">
                <span className="block tabular-nums text-muted">{formatBr(entry.date)}</span>
                <span className="block whitespace-pre-line text-foreground">{entry.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
