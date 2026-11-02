/**
 * Mensagens de relacionamento, prontas para o WhatsApp.
 *
 * A cobrança já tinha a sua em `billingMessage.ts`. Estas são as outras duas
 * conversas que o painel sabe que precisam acontecer e que, até agora, o
 * professor tinha de escrever do zero no celular: o parabéns e o "sumiu".
 *
 * Funções puras, com teste próprio, pelo mesmo motivo da cobrança: o texto é
 * a parte que vai ser ajustada com o tempo, e ninguém deveria precisar abrir
 * uma tela para conferir se ficou certo.
 *
 * O tom é o do professor na recepção — primeiro nome, uma frase, sem
 * modelo corporativo. Mensagem que parece automática não traz ninguém de
 * volta para o tatame.
 */

/** Primeiro nome, que é como o professor chama o aluno. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export interface BirthdayInput {
  readonly name: string;
  /** Idade que a pessoa está completando. */
  readonly turning: number;
  readonly academyName: string;
  /** `true` quando a mensagem vai para o responsável, não para o aluno. */
  readonly toGuardian?: boolean;
  /** Nome do responsável, quando a mensagem é para ele. */
  readonly guardianName?: string;
}

export function buildBirthdayMessage(input: BirthdayInput): string {
  const aluno = firstName(input.name);

  if (input.toGuardian === true) {
    const quem = input.guardianName ? firstName(input.guardianName) : null;
    return [
      quem ? `Olá, ${quem}!` : 'Olá!',
      '',
      `Hoje é aniversário do ${aluno} — ${input.turning} anos! A gente aqui da ${input.academyName} deseja tudo de bom para ele.`,
      '',
      'Parabéns, e bom treino! 🥋',
    ].join('\n');
  }

  return [
    `Parabéns, ${aluno}! 🥋`,
    '',
    `${input.turning} anos hoje. Toda a ${input.academyName} deseja um ano excelente, dentro e fora do tatame.`,
    '',
    'Bom treino!',
  ].join('\n');
}

export interface ComebackInput {
  readonly name: string;
  /** Dias desde o último treino. `null` quando nunca treinou. */
  readonly daysAway: number | null;
  readonly academyName: string;
  /** Turma em que ele treinava, para a mensagem ter o horário certo. */
  readonly classHint?: string;
}

/**
 * "Sentimos sua falta".
 *
 * Nunca cita o número de dias. "Você está há 47 dias sem treinar" soa como
 * cobrança de ponto e constrange quem parou por lesão, trabalho ou dinheiro —
 * que é a maioria. A mensagem convida e abre espaço para a pessoa dizer o que
 * aconteceu, se quiser.
 */
export function buildComebackMessage(input: ComebackInput): string {
  const aluno = firstName(input.name);
  const linhas: string[] = [];

  linhas.push(`Olá, ${aluno}! Tudo bem?`);
  linhas.push('');

  if (input.daysAway === null) {
    linhas.push(
      'Vi que você se matriculou e ainda não apareceu para o primeiro treino. Precisa de alguma coisa para começar?',
    );
  } else {
    linhas.push('Senti sua falta no tatame nas últimas semanas.');
  }

  if (input.classHint && input.classHint.trim().length > 0) {
    linhas.push('');
    linhas.push(`Sua turma continua ${input.classHint.trim()} — a porta está aberta.`);
  } else {
    linhas.push('');
    linhas.push('A porta está aberta quando você quiser voltar.');
  }

  linhas.push('');
  linhas.push(`Qualquer coisa me chama por aqui. — ${input.academyName}`);

  return linhas.join('\n');
}
