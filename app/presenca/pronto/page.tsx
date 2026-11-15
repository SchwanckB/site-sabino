import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { resolveActiveProfile } from '@/lib/activeProfile';
import { getSessionUser } from '@/lib/auth';
import { getTodayCheckins } from '@/lib/repositories/attendance';
import { getStudent } from '@/lib/repositories/students';
import { saoPauloTimeString } from '@/utils/datetime';

export const metadata: Metadata = {
  title: 'Presença registrada',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Confirmação da presença por aproximação.
 *
 * A gravação acontece na rota da plaquinha; esta tela só confirma. E confirma
 * **lendo o banco**, não um parâmetro da URL: a alternativa seria a rota
 * mandar o resultado em `?ok=1&aula=MMA`, e aí qualquer pessoa que digitasse
 * isso na barra de endereço veria uma confirmação de presença que não existe.
 * Numa tela cuja única função é dizer "deu certo", isso é o defeito inteiro.
 *
 * Sem JavaScript, sem interação: o aluno encostou o celular e lê a resposta.
 * É por isso que ela é um componente de servidor puro.
 */
export default async function PresencaProntoPage() {
  const user = await getSessionUser();
  if (!user) redirect('/entrar');

  const perfil = await resolveActiveProfile(user.id, await getStudent(user.id));
  if (!perfil) redirect('/onboarding');

  const student = perfil.student;
  const now = new Date();

  const doDia = (await getTodayCheckins([student.id], now)).get(student.id) ?? [];

  // A última presença do dia é a que a plaquinha acabou de gravar. Ordem
  // decrescente: o aluno que treina duas aulas vê a que ele marcou agora.
  const ultima = [...doDia].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;

  const primeiroNome = student.name.split(' ')[0] ?? student.name;

  return (
    <main id="conteudo" className="mx-auto w-full max-w-md px-5 py-16">
      {ultima ? (
        <div className="rounded-3xl border border-emerald-500/40 bg-emerald-500/[.08] p-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>

          <h1 className="mt-5 text-2xl leading-none">Presença registrada</h1>

          {/*
            O nome do perfil aparece sempre, e não só quando é dependente.
            A plaquinha é usada pelo pai que leva dois filhos: ler "presença de
            Pedro" é o que lhe diz que ele não marcou duas vezes no mesmo.
          */}
          <p className="mt-3 text-sm text-muted">
            {primeiroNome} · {ultima.classTitle ?? 'treino'} às {saoPauloTimeString(ultima.at)}
          </p>

          {doDia.length > 1 ? (
            <p className="mt-1 text-xs text-muted">
              {doDia.length} presenças hoje nesta conta.
            </p>
          ) : null}

          <p className="mt-4 text-sm text-muted">Bom treino!</p>

          <Link href="/painel" className="btn-primary mt-6 w-full">
            Abrir meu painel
          </Link>
        </div>
      ) : (
        /*
          Chegou aqui sem presença no dia.

          Acontece se a gravação falhou — Redis fora do ar — ou se alguém
          digitou o endereço à mão. Mandar para a tela de check-in é o caminho
          útil: lá o aluno vê o motivo real e tenta de novo.
        */
        <div className="panel p-8 text-center">
          <h1 className="text-2xl leading-none">Nada registrado ainda</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Não encontramos presença de {primeiroNome} hoje. Encoste o celular na plaquinha de
            novo, ou use o QR Code da recepção.
          </p>
          <Link href="/painel/checkin" className="btn-primary mt-6 w-full">
            Ir para o check-in
          </Link>
        </div>
      )}
    </main>
  );
}
