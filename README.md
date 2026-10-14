# Sabino Academia

Plataforma da Sabino Academia (Jiu-Jitsu e MMA, Três Cachoeiras/RS): landing page
pública + base para o web app de gestão.

Stack: Next.js 15 (App Router) · TypeScript `strict` · Tailwind CSS · Framer
Motion · Upstash Redis · Vitest.

---

## Rodando o projeto

```bash
npm install
cp .env.example .env.local   # preencha o que for usar
npm run dev                  # http://localhost:3000
```

O site funciona **sem nenhuma variavel de ambiente**: sem Redis, a grade de
horarios cai para `data/seed.ts`.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de producao |
| `npm start` | Sobe o build de producao |
| `npm test` | Testes do motor de graduacao (Vitest) |
| `npm run test:watch` | Testes em watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

### Rotas

| Rota | Descricao |
|---|---|
| `/` | Landing page (estatica, revalida a cada 1h) |
| `/admin/graduacao` | **Preview** do painel de graduacao com dados ficticios |

> `/admin/graduacao` ainda **nao tem protecao de autenticacao**. Ela so serve
> dados de `data/demoStudents.ts` e esta marcada como `noindex`. Antes de
> publicar, restrinja ao papel `ADMIN` via middleware do Clerk.

---

## O que precisa ser substituido antes de publicar

Tudo que e placeholder esta marcado com `isExample` no codigo e exibe um aviso
visivel na interface.

### Imagens (`/public/images/`)

Os arquivos atuais sao placeholders escuros com a palavra "substituir por foto
real". Troque mantendo **o mesmo nome e proporcao**:

| Arquivo | Proporcao | Onde aparece |
|---|---|---|
| `hero-tatame.jpg` | 16:9 (1920×1080) | Fundo do hero |
| `academia-tatame.jpg` | 4:5 (1200×1500) | Secao "A academia" |
| `modalidade-jiu-jitsu.jpg` | 16:9 (1600×900) | Card grande de Jiu-Jitsu |
| `modalidade-mma.jpg` | 4:3 (1200×900) | Card de MMA |
| `modalidade-kids.jpg` | 4:3 (1200×900) | Card de Kids |

Ja prontos a partir da logo oficial, **nao precisam ser trocados**:
`/public/logo.png`, `/public/logo-light.png`, `/public/og-image.png`,
`/app/icon.png`.

### Textos e dados

**Já confirmados** (não precisam de alteração): grade de horários completa,
endereço (Rua Josué Maggi, 155 - Centro, atrás da Escola Angelina Maggi),
telefone `(51) 98169-1373`, Instagram `@sabinoacademia`, CEP `95580-000`, as duas
aulas experimentais gratuitas, e as respostas do FAQ sobre idade mínima, turma
feminina e atendimento.

**Ainda pendentes** — marcados com `isExample` e com aviso visível na página:

| Onde | O que falta |
|---|---|
| `data/seed.ts` → `plans` | Preços reais e o que cada plano inclui |
| `data/seed.ts` → `testimonials` | Depoimentos reais, **com autorização de uso de nome e imagem** |
| `data/seed.ts` → `faq` | Resposta de "como funciona o cancelamento do plano?" |

---

## Arquitetura

```
app/
  layout.tsx              fontes, metadata base, skip link
  page.tsx                compoe as secoes da landing
  admin/graduacao/        preview do painel (sem auth ainda)
components/
  landing/                uma secao por arquivo
  admin/GraduationDashboard.tsx
  ui/Reveal.tsx           wrappers de animacao com prefers-reduced-motion
data/
  seed.ts                 dados de exemplo + fallback da grade
  demoStudents.ts         alunos ficticios do preview
lib/
  redis.ts                cliente Upstash (server-only)
  schedule.ts             getSchedule(): Redis -> seed
  site.ts                 contatos, URLs, navegacao
utils/
  graduationEngine.ts     regras de graduacao (funcao pura)
docs/
  redis-schema.md         modelagem completa do Redis
```

### Motor de graduacao

`utils/graduationEngine.ts` e **puro**: recebe `now: Date` por parametro e nao
faz I/O. Todas as comparacoes usam **dias de calendario em `America/Sao_Paulo`**,
nunca milissegundos — uma data `YYYY-MM-DD` e tratada como data civil, nao como
instante UTC (senao toda data de nascimento andaria um dia para tras).

```bash
npm test   # 40 testes
```

Cobre: 29/30 dias exatos, troca de tarja em 4→5 e 8→9, grau 12, aniversario de
16 anos, ano bissexto, virada de mes e de ano, aluno sem `lastGraduationAt`, e
limites de fuso a meia-noite.

### Seguranca

- **CSP e cabecalhos** em `next.config.mjs`: `Content-Security-Policy`,
  `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`. `X-Powered-By` desligado.
- **`server-only`** em `lib/redis.ts` e `lib/schedule.ts`: se um Client Component
  importar esses modulos, o build falha em vez de arrastar credenciais para o
  bundle.
- **Dado externo validado**: a grade vinda do Redis passa por validacao campo a
  campo antes de chegar na UI; um registro invalido e descartado sozinho.
- **Nenhum dado pessoal em rota publica**: a landing page le apenas
  `schedule:classes`. CPF e documentos ficam em `user:{clerkId}`, so acessivel
  do servidor em contexto autenticado (ver `docs/redis-schema.md`, secao 10).

Ao ligar Clerk e Vercel Blob, adicione os dominios deles em `script-src`,
`connect-src`, `img-src` e `frame-src` na CSP.

---

## Proximas rodadas

1. **Auth e middleware** — Clerk, protecao de `/admin/*` e `/painel/*` por
   `publicMetadata.role`.
2. **Cadastro e onboarding** — CPF com digito verificador, menor de 18 com
   responsavel, upload para o Vercel Blob privado, aceite de LGPD versionado.
3. **Check-in por QR Code** — token rotativo em `qr:current`, trava diaria via
   `SET NX`, ranking atualizado em transacao.
4. **Financeiro** — `payments:due` como indice de inadimplentes, "marcar como
   pago" e historico.
5. **Integrar o dashboard** — trocar `data/demoStudents.ts` pelas leituras de
   `graduation:due` e transformar os handlers do preview em Server Actions.
