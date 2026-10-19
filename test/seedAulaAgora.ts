/**
 * Cria uma turma acontecendo **agora** no Redis de teste e matricula o
 * professor nela.
 *
 * Serve para exercitar o caminho positivo do check-in sem esperar as 18h30:
 * a janela de horário é a trava principal desde que o QR virou fixo, então
 * testar só o caminho de recusa não prova que a presença chega a ser gravada.
 *
 *   npx tsx --conditions=react-server test/seedAulaAgora.ts <clerkUserId>
 */

async function main(): Promise<void> {
  process.env['UPSTASH_REDIS_REST_URL'] ??= 'http://127.0.0.1:4321';
  process.env['UPSTASH_REDIS_REST_TOKEN'] ??= 'test-token';

  const scheduleAdmin = await import('../lib/repositories/scheduleAdmin');
  const students = await import('../lib/repositories/students');

  const userId = process.argv[2] ?? '';
  if (userId.length === 0) {
    console.log('informe o id do usuário Clerk');
    return;
  }

  const now = new Date();
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const minuto = Number(partes.find((p) => p.type === 'minute')?.value ?? '0');

  const diaSemana = new Date(
    new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toDateString(),
  ).getDay();

  const hhmm = (h: number, m: number) =>
    `${String((h + 24) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const resultado = await scheduleAdmin.upsertClass(
    {
      weekday: diaSemana,
      startTime: hhmm(hora, 0),
      endTime: hhmm(hora + 1, 0),
      title: 'Teste de check-in',
      modality: 'jiu-jitsu',
      level: 'Aula de teste',
      unit: 'tres-cachoeiras',
    },
    now,
  );

  if (!resultado.ok) {
    console.log('falhou: ' + resultado.error);
    return;
  }

  const aluno = await students.getStudent(userId);
  if (!aluno) {
    console.log('aluno não encontrado: ' + userId);
    return;
  }

  await students.updateStudent(
    userId,
    { classIds: [...aluno.classIds, resultado.slot.id] },
    now,
  );

  console.log(`turma criada: ${resultado.slot.id}`);
  console.log(`horário: ${resultado.slot.startTime} às ${resultado.slot.endTime}`);
  console.log(`agora são ${hhmm(hora, minuto)} (dia ${diaSemana})`);
}

void main();

// Sem import estático, o TypeScript trataria o arquivo como script global e
// as duas `main()` colidiriam. Isto o torna um módulo.
export {};
