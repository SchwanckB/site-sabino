'use client';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';

import { rebuildModalityRankingsAction } from '../actions';

/**
 * Recálculo dos rankings por modalidade.
 *
 * Fica aqui, e não escondido num script, porque é uma operação que a academia
 * precisa poder repetir: a classificação do passado sai do `classId` casado
 * contra a grade de agora, então mexer na modalidade de uma turma desatualiza
 * o acumulado dela.
 *
 * O botão não some depois de usado. Rodar de novo é idempotente — a varredura
 * reescreve as chaves do zero — e esconder a ação depois do primeiro uso
 * obrigaria a academia a pedir socorro para refazer algo que é rotina.
 */
export function RebuildRankings() {
  return (
    <section className="panel panel-pad mt-6">
      <h2 className="panel-title">Rankings por modalidade</h2>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Cada modalidade tem a sua lista no painel do aluno, para quem treina só Jiu-Jitsu não
        disputar o pódio com quem soma Jiu-Jitsu e MMA na mesma noite.
      </p>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        As presenças antigas foram registradas antes de o sistema guardar a modalidade de cada
        treino. Rode o recálculo uma vez para que elas entrem nas listas — e de novo sempre que
        mudar a modalidade de alguma turma na grade.
      </p>

      <ActionForm
        action={rebuildModalityRankingsAction}
        className="mt-4"
        confirm="Recalcular os rankings por modalidade a partir de todo o histórico? Pode levar alguns segundos."
      >
        <SubmitButton className="btn-secondary text-sm" pendingLabel="Recalculando…">
          Recalcular agora
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
