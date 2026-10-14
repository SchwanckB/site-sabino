# Sabino Academia

Plataforma da Sabino Academia (Jiu-Jitsu e MMA, Três Cachoeiras/RS): landing page
pública + web app de gestão com painel do aluno e do administrador.

Stack: Next.js 15 (App Router) · TypeScript `strict` · Tailwind CSS · Framer
Motion · Clerk · Upstash Redis · Vercel Blob · Vitest.

---

## Rodando o projeto

```bash
npm install
cp .env.example .env.local   # preencha o que for usar
npm run dev                  # http://localhost:3000
```

A **landing page funciona sem nenhuma variável de ambiente**. A área logada
precisa de Clerk + Redis; sem eles, `/painel` e `/admin` redirecionam para
`/configurar`, que lista exatamente o que falta e onde conseguir.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Sobe o build de produção |
| `npm test` | 86 testes de domínio (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

---

## Configuração

### Obrigatório

| Variável | Onde conseguir |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | clerk.com → aplicação → API Keys |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | upstash.com → Create Database (sa-east-1) → REST API.<br>**Ou** ligue a integração Upstash em Vercel → Storage: ela cria `KV_REST_API_URL`/`KV_REST_API_TOKEN` e o app aceita esses nomes direto. |
| `NEXT_PUBLIC_SITE_URL` | A URL pública do site |
| `ADMIN_EMAILS` | E-mails que entram como ADMIN (veja abaixo) |

### Opcional

| Variável | Para quê |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Upload do documento no cadastro (Vercel → Storage → Blob) |
| `QR_TOKEN_TTL_SECONDS` | Segundos até o QR da recepção girar (padrão 120) |

### O primeiro administrador

Há um problema de partida: sem nenhum admin, ninguém pode aprovar cadastros —
inclusive o próprio. `ADMIN_EMAILS` resolve isso: os e-mails listados entram
como ADMIN mesmo sem metadado no Clerk.

```
ADMIN_EMAILS="seu-email@exemplo.com"
```

1. Defina a variável.
2. Crie sua conta em `/cadastro` **com esse mesmo e-mail**.
3. Entre — você cai direto em `/admin`.

A **senha nunca fica no código nem em variável de ambiente**: ela é criada por
você no cadastro e o Clerk guarda só o hash.

---

## Como o sistema funciona

### Fluxo da matrícula

```
Aluno cria conta  →  /onboarding          →  status "pendente"
                     (CPF, nascimento,
                      responsável se menor,
                      documento, LGPD)
                                              ↓
Admin em /admin/aprovacoes:  confere o documento,
                             atribui as turmas,
                             define faixa/graus,
                             combina a mensalidade
                                              ↓
                             status "ativo"  →  aluno acessa /painel
```

O aluno só entra no painel depois de aprovado. Enquanto espera, vê
`/aguardando`; se recusado, vê o motivo e pode corrigir o cadastro.

### Os três modos de presença

| Modo | Onde | Como funciona |
|---|---|---|
| **QR Code** | Aluno, em `/painel/checkin` | A recepção deixa `/admin/qr` aberto. O QR codifica a URL do check-in **já com o token** — a câmera nativa do celular abre a página e registra sozinha, sem app. O token gira a cada 2 min, então foto do QR mandada no WhatsApp não funciona. |
| **Manual individual** | Admin, em `/admin/presenca` | Botão "Marcar presente" ao lado de cada aluno. |
| **Manual em lote** | Admin, em `/admin/presenca` | Seleciona vários e registra todos de uma vez. |

A tela de presença abre filtrada por "com aula agora": durante o treino, a
recepção vê só quem deveria estar no tatame naquele horário.

Regras garantidas no servidor: **1 presença por aluno por dia** (trava atômica
via `SET NX`, sem janela de corrida), só alunos `ativo`, e a presença fica
vinculada à aula que está acontecendo.

### Financeiro

O admin combina com o aluno: vence todo dia X, com Y dias de tolerância. O
sistema calcula o resto.

- **Semáforo**: verde (em dia), amarelo (vence em ≤5 dias ou dentro da
  tolerância), vermelho (passou da tolerância).
- **Parcelas acumulam**: se o aluno ficar 3 meses sem pagar, aparecem 3 parcelas
  em aberto com o total somado — não só "vencida".
- **Marcar como pago** avança o vencimento conforme o plano (mensal +1 mês,
  trimestral +3, anual +12) e grava no histórico. Tem desfazer.
- Vencimento no dia 31 cai no último dia dos meses curtos e **volta para 31** no
  mês seguinte.

### Graduação

- **Infantil**: 12 graus, intervalo mínimo de 30 dias, tarja branca (1-4),
  vermelha (5-8) e amarela (9-12). `/admin/graduacao` lista quem está elegível.
- **Adulto**: sem automação. O painel mostra tempo na faixa, frequência total e
  dos últimos 90 dias para o professor decidir.
- Ao completar 16 anos o aluno sai do fluxo automático; ao fechar os 12 graus,
  fica aguardando avaliação de faixa.

---

## Rotas

| Rota | Quem acessa |
|---|---|
| `/` | Público — landing page |
| `/cadastro`, `/entrar` | Público |
| `/onboarding`, `/aguardando` | Logado |
| `/painel` | Aluno ativo — faixa, graus, mensalidade, frequência, aulas, próxima aula |
| `/painel/checkin` | Aluno ativo — check-in por QR |
| `/admin` | ADMIN — visão geral |
| `/admin/aprovacoes` | ADMIN — fila de cadastros |
| `/admin/alunos`, `/admin/alunos/[id]` | ADMIN — ficha completa e edição |
| `/admin/presenca` | ADMIN — chamada individual e em lote |
| `/admin/financeiro` | ADMIN — mensalidades e inadimplentes |
| `/admin/graduacao` | ADMIN — elegíveis e histórico adulto |
| `/admin/horarios` | ADMIN — CRUD da grade (reflete no site) |
| `/admin/qr` | ADMIN — tela da recepção |
| `/configurar` | Público — diagnóstico de variáveis |

---

## Segurança

- **Toda Server Action começa com `requireAdmin()` ou `requireUser()`.** Server
  Actions são endpoints HTTP públicos; sem isso, qualquer um com o ID da action
  poderia aprovar matrículas ou quitar mensalidades.
- **Papel verificado na fonte**, com `currentUser()` nos layouts de `/admin` e
  `/painel` — não no middleware, onde depender de `publicMetadata` exigiria um
  JWT template no painel do Clerk e esquecer esse passo viraria um falso
  positivo silencioso.
- **Documento do aluno**: o Redis guarda só o caminho no Blob, nunca uma URL. O
  admin vê o arquivo por `/api/admin/documento/[userId]`, que confere a sessão e
  transmite os bytes com `no-store`. Sem sessão de ADMIN, responde 404 — não
  confirma nem que o aluno existe.
- **CPF** nunca sai inteiro do servidor: as telas recebem `•••.•••.•••-25` via
  `toPublicStudent()`.
- **`server-only`** em todos os repositórios: um import acidental em componente
  de cliente quebra o build em vez de arrastar credenciais para o bundle. Isso
  já pegou um erro real durante o desenvolvimento.
- **Dado externo validado**: tudo que volta do Redis passa por coerção
  defensiva — o cliente Upstash desserializa JSON sozinho, e um nome igual a
  "null" ou CPF com zero à esquerda quebraria silenciosamente.
- **CSP e cabeçalhos** em `next.config.mjs`, com `X-Powered-By` desligado.

---

## Domínio testado

Quatro módulos puros, sem I/O, recebendo `now: Date` por parâmetro — o que os
torna determinísticos e testáveis:

| Arquivo | O que resolve |
|---|---|
| `utils/graduationEngine.ts` | Graus, tarjas, elegibilidade, migração aos 16 |
| `utils/paymentEngine.ts` | Vencimento, tolerância, parcelas acumuladas |
| `utils/attendanceEngine.ts` | Janela de check-in e próxima aula |
| `utils/cpf.ts` | Dígitos verificadores |

```bash
npm test   # 86 testes
```

Todas as comparações de data usam **dias de calendário em `America/Sao_Paulo`**,
nunca milissegundos — e uma data `YYYY-MM-DD` é tratada como data civil, não
como instante UTC (senão toda data de nascimento andaria um dia para trás).

---

## O que ainda falta substituir

### Imagens (`/public/images/`)

Placeholders escuros escritos "substituir por foto real". Troque mantendo o
mesmo nome e proporção:

| Arquivo | Proporção | Onde aparece |
|---|---|---|
| `hero-tatame.jpg` | 1920×1080 | Fundo do hero |
| `academia-tatame.jpg` | 1200×1500 | Seção "A academia" |
| `modalidade-jiu-jitsu.jpg` | 1600×900 | Card de Jiu-Jitsu |
| `modalidade-mma.jpg` | 1200×900 | Card de MMA |
| `modalidade-kids.jpg` | 1200×900 | Card infantil |

A logo já está pronta (`logo.png`, `logo-light.png`, `og-image.png`,
`app/icon.png`), extraída do PDF oficial.

### Conteúdo

| Onde | O que falta |
|---|---|
| `data/seed.ts` → `plans` | Preços reais |
| `data/seed.ts` → `testimonials` | Depoimentos reais, com autorização de nome e imagem |
| `data/seed.ts` → `faq` | Resposta de "como funciona o cancelamento" |

Já confirmados: grade de horários, endereço, CEP, telefone, Instagram e as duas
aulas experimentais gratuitas.

---

## Próximos passos sugeridos

1. **Ranking** — os ZSETs já são alimentados a cada check-in; falta a tela.
2. **PWA** — manifest, ícones e cache da shell para instalar no celular.
3. **Notificações** — avisar o aluno quando a mensalidade estiver perto de vencer.
4. **Job diário** (Vercel Cron) — migrar quem fez 16 anos e atualizar o cache de
   status de pagamento. Descrito em `docs/redis-schema.md`, seção 9.
