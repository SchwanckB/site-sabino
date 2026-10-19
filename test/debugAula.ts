/** Diagnóstico: por que nenhuma turma está aberta agora? */

async function main(): Promise<void> {
  process.env['UPSTASH_REDIS_REST_URL'] ??= 'http://127.0.0.1:4321';
  process.env['UPSTASH_REDIS_REST_TOKEN'] ??= 'test-token';

  const scheduleAdmin = await import('../lib/repositories/scheduleAdmin');
  const students = await import('../lib/repositories/students');
  const engine = await import('../utils/attendanceEngine');
  const datetime = await import('../utils/datetime');

  const now = new Date();
  const classes = await scheduleAdmin.getEditableSchedule();
  const aluno = await students.getStudent(process.argv[2] ?? '');

  const parts = datetime.saoPauloParts(now);
  console.log(`agora: weekday=${parts.weekday} ${parts.hour}:${parts.minute}`);
  console.log(`minutos do dia: ${datetime.saoPauloMinutesOfDay(now)}`);

  const teste = classes.filter((c) => c.id.includes('teste'));
  console.log(`turma de teste: ${JSON.stringify(teste)}`);

  console.log(`classIds do aluno: ${JSON.stringify(aluno?.classIds)}`);

  const abertas = engine.findOpenClasses(classes, aluno?.classIds ?? [], now);
  console.log(`abertas: ${JSON.stringify(abertas)}`);
}

void main();

// Sem import estático, o TypeScript trataria o arquivo como script global e
// as duas `main()` colidiriam. Isto o torna um módulo.
export {};
