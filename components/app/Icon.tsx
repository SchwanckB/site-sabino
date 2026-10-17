/**
 * Ícones das áreas logadas.
 *
 * Desenhados à mão em vez de puxar uma biblioteca: são dez traços simples e
 * uma dependência de ícones custaria mais quilobytes no celular do aluno do
 * que o painel inteiro. Todos herdam `currentColor` e o traço fica igual em
 * qualquer tamanho.
 */

export type IconName =
  | 'inicio'
  | 'qr'
  | 'presenca'
  | 'alunos'
  | 'calendario'
  | 'dinheiro'
  | 'faixa'
  | 'relogio'
  | 'grafico'
  | 'trofeu'
  | 'unidade'
  | 'horarios'
  | 'plano'
  | 'aprovacao'
  | 'conta'
  | 'mais'
  | 'fechar';

const PATHS: Readonly<Record<IconName, React.ReactNode>> = {
  inicio: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6" />,
  qr: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <path d="M8 12h8" />
    </>
  ),
  presenca: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  alunos: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11.5a3 3 0 0 0 0-6M17.5 19.5c0-2-.6-3.6-1.7-4.7 2.6.2 4.7 2.1 4.7 4.7" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      <path d="M7.5 14h3M13.5 14h3M7.5 17.5h3" />
    </>
  ),
  dinheiro: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  faixa: (
    <>
      <path d="M3 9.5h18v5H3z" />
      <path d="M15.5 9.5v5M18 9.5v5" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.5 2" />
    </>
  ),
  grafico: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  trofeu: (
    <>
      <path d="M7 4.5h10v4.5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.8a.8.8 0 0 0-.8.8c0 1.9 1.4 3.5 3.2 3.8M17 6h2.2a.8.8 0 0 1 .8.8c0 1.9-1.4 3.5-3.2 3.8" />
      <path d="M12 14v3.5M8.5 20h7M9.5 17.5h5V20h-5z" />
    </>
  ),
  unidade: (
    <>
      <path d="M4 20.5V8.2a1 1 0 0 1 .5-.87l5.5-3.2a1 1 0 0 1 1 0l5.5 3.2a1 1 0 0 1 .5.87V20.5" />
      <path d="M2.5 20.5h19M17 11.5h3a1 1 0 0 1 1 1v8" />
      <path d="M8 20.5v-4h4.5v4M8 10.5h1.5M12 10.5h1.5M8 13.5h1.5M12 13.5h1.5" />
    </>
  ),
  horarios: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" />
    </>
  ),
  plano: (
    <>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h5.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8l-5.2 5.2a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4z" />
      <circle cx="8" cy="10" r="1.3" />
    </>
  ),
  aprovacao: (
    <>
      <path d="M5.5 4.5h9l4.5 4.5v10.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-13a2 2 0 0 1 1.5-2z" />
      <path d="M14 4.5V9h4.5" />
      <path d="m8.5 15 2 2 4-4.5" />
    </>
  ),
  conta: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    </>
  ),
  mais: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({
  name,
  className = 'h-6 w-6',
}: {
  readonly name: IconName;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
