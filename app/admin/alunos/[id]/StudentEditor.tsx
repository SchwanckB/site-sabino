'use client';

import { ActionForm, SubmitButton } from '@/components/app/ActionForm';
import { cn } from '@/lib/utils';
import {
  ADULT_BELTS,
  GENDER_LABELS,
  GENDERS,
  UNITS,
  UNIT_LABELS,
  KIDS_BELTS,
  STATUS_LABELS,
  USER_STATUSES,
} from '@/types/domain';
import type { Gender, UnitId, UserStatus } from '@/types/domain';

import {
  promoteBeltAction,
  registerDegreeAction,
  setStatusAction,
  undoDegreeAction,
  updateStudentAction,
} from '../../actions';
import { ClassPicker, type ClassOption } from '../../ClassPicker';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-hairline bg-white/[.04] px-3 py-2 text-sm text-foreground focus:border-crimson focus:outline-none';

/**
 * Edição da ficha pelo administrador: turmas, graduação e situação.
 * Cada bloco é um formulário próprio para que um erro em um não descarte o
 * que já foi preenchido no outro.
 */
export function StudentEditor({
  studentId,
  name,
  joinedAt,
  lastGraduationAt,
  today,
  belt,
  degree,
  notes,
  status,
  gender,
  unit,
  graduatesMonthly,
  isKids,
  assignedClassIds,
  classOptions,
}: {
  readonly studentId: string;
  readonly name: string;
  /** `YYYY-MM-DD` da matrícula, ou vazio para quem ainda não foi aprovado. */
  readonly joinedAt: string;
  /** `YYYY-MM-DD` da última graduação, ou vazio para quem nunca graduou. */
  readonly lastGraduationAt: string;
  /** Hoje em São Paulo: teto do campo de data. */
  readonly today: string;
  readonly belt: string;
  readonly degree: number;
  readonly notes: string;
  readonly status: UserStatus;
  readonly gender: Gender;
  readonly unit: UnitId;
  readonly graduatesMonthly: boolean;
  readonly isKids: boolean;
  readonly assignedClassIds: readonly string[];
  readonly classOptions: readonly ClassOption[];
}) {
  const belts = isKids ? KIDS_BELTS : ADULT_BELTS;
  const maxDegree = isKids ? 12 : 4;

  return (
    <div className="space-y-6">
      {/* Turmas, faixa e graus ------------------------------------------ */}
      <ActionForm action={updateStudentAction} className="panel p-5 sm:p-6">
        <input type="hidden" name="studentId" value={studentId} />
        <h2 className="text-lg normal-case tracking-normal">Cadastro, turmas e graduação</h2>

        {/*
          Nome e data de matrícula: as duas correções que só davam para fazer
          no banco. O aluno digita o nome no cadastro e erra — abreviado, tudo
          minúsculo, sem sobrenome — e a matrícula de quem já treinava antes do
          sistema entrou com a data da aprovação, não a real.
        */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Nome do aluno
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={name}
              className={cn(inputClass, 'mt-2')}
            />
          </div>

          <div>
            <label htmlFor="joinedAt" className="block text-sm font-medium">
              Matriculado em
            </label>
            <input
              id="joinedAt"
              name="joinedAt"
              type="date"
              max={today}
              defaultValue={joinedAt}
              className={cn(inputClass, 'mt-2')}
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {isKids
                ? 'Conta o tempo de casa e, para quem ainda não graduou, é a data de onde sai a previsão do próximo grau.'
                : 'Conta o tempo de casa e o tempo na faixa.'}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="lastGraduationAt" className="block text-sm font-medium">
              Última graduação
            </label>

            {/*
              O marcador distingue "o formulário não mandou o campo" de "o
              professor apagou o campo". Sem ele, limpar a data seria lido
              como ausência e a data antiga continuaria no banco.
            */}
            <input type="hidden" name="lastGraduationAtPresent" value="on" />
            <input
              id="lastGraduationAt"
              name="lastGraduationAt"
              type="date"
              max={today}
              defaultValue={lastGraduationAt}
              className={cn(inputClass, 'mt-2 sm:max-w-xs')}
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Para quem já treinava antes do sistema e não lembra a data exata, vale a
              aproximação — é daqui que sai o tempo na faixa
              {isKids ? ' e a previsão do próximo grau' : ''}. Em branco, conta desde a
              matrícula. Registrar um grau pelo botão abaixo sobrescreve esta data.
            </p>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Em quais aulas ele treina</legend>
          <p className="mt-1 text-xs text-muted">
            Define a janela em que o check-in dele é aceito. Só as turmas de{' '}
            {UNIT_LABELS[unit]} — trocar a academia na ficha troca esta lista.
          </p>

          {/*
            Esta lista mostrava a grade inteira, das duas academias. Marcar um
            aluno de Terra de Areia numa turma de Três Cachoeiras era aceito
            sem reclamação, e o check-in dele simplesmente nunca abria — sem
            nada na tela explicando por quê.
          */}
          <ClassPicker
            classOptions={classOptions}
            unit={unit}
            initialSelected={assignedClassIds}
          />
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="belt" className="block text-sm font-medium">
              Faixa
            </label>
            <select
              id="belt"
              name="belt"
              defaultValue={belt}
              className={cn(inputClass, 'mt-2 capitalize')}
            >
              {belts.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="degree" className="block text-sm font-medium">
              Graus (0 a {maxDegree})
            </label>
            <input
              id="degree"
              name="degree"
              type="number"
              min={0}
              max={maxDegree}
              defaultValue={degree}
              className={cn(inputClass, 'mt-2')}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="gender" className="block text-sm font-medium">
              Sexo
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue={gender}
              className={cn(inputClass, 'mt-2')}
            >
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {GENDER_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="unit" className="block text-sm font-medium">
              Academia
            </label>
            <select
              id="unit"
              name="unit"
              defaultValue={unit}
              className={cn(inputClass, 'mt-2')}
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted">
              Mudar de academia não transfere as turmas: reatribua abaixo.
            </p>
          </div>
        </div>

        {isKids ? (
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-white/[.03] p-3.5">
            <input
              type="checkbox"
              name="graduatesMonthly"
              defaultChecked={graduatesMonthly}
              className="mt-0.5 h-4 w-4 shrink-0 accent-crimson"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Gradua todo mês</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                Desmarque para o aluno sair da previsão automática de graus — quem treina uma
                vez por semana, quem está voltando de lesão. Ele continua na turma e na
                chamada; você gradua na mão quando for a hora.
              </span>
            </span>
          </label>
        ) : null}

        <div className="mt-5">
          <label htmlFor="notes" className="block text-sm font-medium">
            Observações
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Lesão, restrição médica, combinado de pagamento diferente, bolsa. Fica só aqui —
            o aluno não vê.
          </p>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            placeholder="Ex.: joelho direito operado em 2025, evitar queda. Paga sempre dia 20."
            defaultValue={notes}
            className={cn(inputClass, 'mt-2 resize-y')}
          />
        </div>

        <SubmitButton className="btn-primary mt-5">Salvar alterações</SubmitButton>
      </ActionForm>

      {/* Graduação rápida ----------------------------------------------- */}
      <div className="panel p-5 sm:p-6">
        <h2 className="text-lg normal-case tracking-normal">Registrar graduação</h2>

        {isKids ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionForm action={registerDegreeAction}>
              <input type="hidden" name="studentId" value={studentId} />
              <SubmitButton pendingLabel="Registrando…">
                Registrar grau {Math.min(degree + 1, 12)}
              </SubmitButton>
            </ActionForm>

            <ActionForm action={undoDegreeAction} confirm="Desfazer a última graduação?">
              <input type="hidden" name="studentId" value={studentId} />
              <SubmitButton className="btn-secondary" pendingLabel="…">
                Desfazer última
              </SubmitButton>
            </ActionForm>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Alunos adultos não têm promoção automática — a troca de faixa é decisão do
            professor.
          </p>
        )}

        <ActionForm
          action={promoteBeltAction}
          className="mt-5 border-t border-hairline pt-5"
          confirm="Promover de faixa? Os graus voltam para zero."
        >
          <input type="hidden" name="studentId" value={studentId} />
          <p className="text-sm font-medium">Promover de faixa</p>
          <p className="mt-1 text-xs text-muted">Zera os graus e registra no histórico.</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="newBelt" className="block text-xs text-muted">
                Nova faixa
              </label>
              <select id="newBelt" name="belt" className={cn(inputClass, 'mt-1 w-36 capitalize')}>
                {belts.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[12rem] flex-1">
              <label htmlFor="note" className="block text-xs text-muted">
                Observação (opcional)
              </label>
              <input id="note" name="note" type="text" className={cn(inputClass, 'mt-1')} />
            </div>

            <SubmitButton className="btn-secondary">Promover</SubmitButton>
          </div>
        </ActionForm>
      </div>

      {/* Situação --------------------------------------------------------- */}
      <ActionForm
        action={setStatusAction}
        className="panel p-5 sm:p-6"
        confirm="Alterar a situação deste aluno?"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <h2 className="text-lg normal-case tracking-normal">Situação do cadastro</h2>
        <p className="mt-1 text-xs text-muted">
          Alunos fora de &ldquo;ativo&rdquo; perdem o acesso ao painel e saem das listas de
          presença e cobrança.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="status" className="sr-only">
              Situação
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className={cn(inputClass, 'w-52')}
            >
              {USER_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton className="btn-secondary">Atualizar situação</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
