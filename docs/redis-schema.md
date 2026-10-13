# Arquitetura de dados - Upstash Redis

Sabino Academia. Banco unico (Upstash Redis via REST), acessado apenas do
servidor (Server Components, Route Handlers e Server Actions).

## Convencoes

| Assunto | Decisao |
|---|---|
| Fuso | Toda regra de negocio usa **dia de calendario em `America/Sao_Paulo`** |
| Datas armazenadas | **ISO 8601 em UTC** (`2025-03-09T22:14:03.000Z`) |
| Datas que sao "dia civil" | `YYYY-MM-DD` sem hora (nascimento, vencimento, chave de check-in) |
| Identificador do aluno | `clerkId` do Clerk, usado como `userId` em todas as chaves |
| Papel | `publicMetadata.role` no Clerk (`ADMIN` \| `ALUNO`) - **nao** duplicado como fonte de verdade aqui |
| Dinheiro | Inteiro em centavos, nunca float |
| Separador | `:` - do mais generico para o mais especifico |

> **Nota sobre o cliente Upstash.** `@upstash/redis` serializa/deserializa JSON
> automaticamente. Um `HSET` com objeto aninhado vira string JSON no campo; por
> isso os hashes abaixo usam apenas campos escalares, e estruturas compostas
> (endereco do responsavel, por exemplo) ficam em um campo JSON explicito.

---

## 1. Cadastro e perfil

### `user:{clerkId}` - Hash

Perfil completo do aluno. **Contem dado pessoal (CPF, documento) e nunca pode
ser lido de um Route Handler publico nem serializado para o cliente.** A landing
page nao toca nesta chave.

| Campo | Tipo | Observacao |
|---|---|---|
| `name` | string | Nome completo |
| `email` | string | Espelho do Clerk, para busca |
| `cpf` | string | Somente digitos, validado com DV no cadastro |
| `birthDate` | string | `YYYY-MM-DD` (dia civil) |
| `status` | string | `pendente` \| `ativo` \| `recusado` \| `inativo` |
| `role` | string | `ADMIN` \| `ALUNO` - **cache** do Clerk, para listagens |
| `category` | string | `kids` \| `adulto` - derivado da idade, recalculado no aniversario |
| `belt` | string | `branca` \| `azul` \| `roxa` \| `marrom` \| `preta` (adulto) ou faixa Kids |
| `degree` | number | 0-4 (adulto) ou 0-12 (Kids) |
| `guardianName` | string | Obrigatorio para menores de 18 |
| `guardianPhone` | string | Obrigatorio para menores de 18 |
| `guardianClerkId` | string | Conta do responsavel, quando houver |
| `joinedAt` | string | ISO UTC - data de **aprovacao**, ancora de graduacao |
| `lastGraduationAt` | string \| null | ISO UTC - editavel pelo Admin |
| `docBlobKey` | string | Caminho no Vercel Blob privado. **Nunca** uma URL publica |
| `consentVersion` | string | Versao da politica aceita, ex.: `lgpd-2025-01` |
| `consentAt` | string | ISO UTC do aceite |
| `avatarBlobKey` | string \| null | Foto de perfil |
| `createdAt` / `updatedAt` | string | ISO UTC |

**TTL:** nenhum.

```bash
HSET user:user_2abc... \
  name "Nome do Aluno" email "aluno@exemplo.com" cpf "00000000000" \
  birthDate "2015-05-10" status "ativo" role "ALUNO" category "kids" \
  belt "cinza" degree 3 \
  guardianName "Nome do Responsavel" guardianPhone "5551900000000" \
  joinedAt "2024-06-01T13:00:00.000Z" lastGraduationAt "2025-01-01T22:10:00.000Z" \
  docBlobKey "docs/user_2abc/rg.pdf" consentVersion "lgpd-2025-01" \
  consentAt "2024-05-30T18:22:10.000Z" \
  createdAt "2024-05-30T18:22:10.000Z" updatedAt "2025-01-01T22:10:00.000Z"
```

### `users:by-status:{status}` - Set

Filas do Admin sem varrer a base. Um `SMEMBERS` resolve a tela de aprovacao.

- Chaves: `users:by-status:pendente`, `:ativo`, `:recusado`, `:inativo`
- **TTL:** nenhum
- Invariante: cada `userId` esta em **exatamente um** destes sets. A troca de
  status e sempre `SREM` do antigo + `SADD` no novo, dentro da mesma transacao.

```bash
SMEMBERS users:by-status:pendente
# 1) "user_2abc..."
```

### `users:index` - Set

Todos os `userId` conhecidos. Serve para reconciliacao e relatorios; nao e
usado em caminho quente.

---

## 2. Check-in

### `checkin:{userId}:{YYYY-MM-DD}` - String com TTL

Garante **1 check-in por aluno por dia**. A atomicidade vem do proprio
`SET ... NX`: se a chave ja existe, o comando devolve `null` e o check-in e
recusado. Nao existe janela de corrida entre "ler" e "gravar".

- Valor: ISO UTC do instante do check-in
- Data da chave: dia civil em Sao Paulo (nao UTC - senao o treino das 22h cairia no dia seguinte)
- **TTL:** segundos ate a proxima meia-noite de Sao Paulo + 1h de folga

```ts
const key = `checkin:${userId}:${saoPauloDate(now)}`;
const stored = await redis.set(key, now.toISOString(), {
  nx: true,
  ex: secondsUntilSaoPauloMidnight(now) + 3600,
});
if (stored === null) {
  // Ja fez check-in hoje.
}
```

### `checkins:{userId}` - ZSET

Historico. `score` = epoch em **milissegundos**, `member` = ISO UTC do check-in
(unico por dia, entao nao ha colisao de membro).

- **TTL:** nenhum
- Consultas: `ZCARD` (total), `ZCOUNT key <inicio> +inf` (ultimos 90 dias),
  `ZREVRANGE key 0 9` (ultimos 10)

```bash
ZADD checkins:user_2abc 1741567200000 "2025-03-10T02:00:00.000Z"
ZCOUNT checkins:user_2abc 1733788800000 +inf   # frequencia nos ultimos 90 dias
```

> O total de check-ins tambem vive em `rank:all` como score. `checkins:{userId}`
> e a fonte de verdade; o ranking e um indice derivado.

---

## 3. Ranking

Todos ZSET, `member` = `userId`, `score` = numero de check-ins.

| Chave | Recorte | TTL |
|---|---|---|
| `rank:all` | Geral, desde sempre | nenhum |
| `rank:month:{YYYY-MM}` | Geral do mes | 400 dias |
| `rank:belt:{faixa}` | Por faixa, geral | nenhum |
| `rank:belt:{faixa}:month:{YYYY-MM}` | Por faixa, no mes | 400 dias |

Os recortes mensais recebem TTL de 400 dias para que o historico sobreviva a um
ano cheio de comparacao e depois seja coletado sozinho.

```bash
ZREVRANGE rank:month:2025-03 0 2 WITHSCORES      # Top 3 do mes
ZREVRANK  rank:month:2025-03 user_2abc           # posicao do aluno (0-based)
ZSCORE    rank:month:2025-03 user_2abc           # pontos do aluno
```

### Troca de faixa e o ranking por faixa

Quando o Admin promove um aluno, o score dele precisa migrar de
`rank:belt:{antiga}` para `rank:belt:{nova}`. Isso acontece na mesma transacao
da graduacao (secao 6).

---

## 4. Graduacao

### `graduation:history:{userId}` - List

`LPUSH` de JSON (mais recente na cabeca).

```json
{
  "at": "2025-02-01T22:30:00.000Z",
  "from": { "belt": "cinza", "degree": 3 },
  "to":   { "belt": "cinza", "degree": 4 },
  "stripeColor": "branca",
  "registeredBy": "user_2admin...",
  "note": ""
}
```

- **TTL:** nenhum
- Leitura: `LRANGE graduation:history:user_2abc 0 19`

### `graduation:due` - ZSET **(indice - resolve "quem esta elegivel")**

Esta e a chave que evita varrer a base. `member` = `userId`, `score` = **dia de
elegibilidade como numero de dias desde a epoch** (o mesmo `dayNumber` usado em
`utils/graduationEngine.ts`).

Score = `dayNumber(ancora) + KIDS_GRADUATION_INTERVAL_DAYS`, onde a ancora e
`lastGraduationAt` ou, na falta dela, `joinedAt`.

```bash
# Elegiveis hoje (20175 = dayNumber de 2025-03-10):
ZRANGEBYSCORE graduation:due -inf 20175
```

Quem mantem o indice:

| Evento | Operacao |
|---|---|
| Aluno aprovado (`status -> ativo`) e `category = kids` | `ZADD graduation:due <dayNumber(joinedAt)+30> userId` |
| Grau registrado | `ZADD graduation:due <dayNumber(hoje)+30> userId` |
| Grau 12 atingido | `ZREM graduation:due userId` (sai do fluxo automatico) |
| Aluno completa 16 anos | `ZREM graduation:due userId` |
| Aluno sai (`inativo` / `recusado`) | `ZREM graduation:due userId` |
| Admin edita a ancora manualmente | `ZADD` com o novo score |

O job diario (secao 8) so precisa reavaliar quem saiu por idade - e para isso
existe `graduation:birthdays` abaixo.

### `graduation:birthdays` - ZSET

`member` = `userId`, `score` = `dayNumber` do **proximo aniversario de 16 anos**.
Um `ZRANGEBYSCORE graduation:birthdays -inf <hoje>` entrega, em O(log n), quem
migrou para adulto sem varrer `users:index`.

### Por que um indice e nao um `SCAN`

`SCAN` com `MATCH user:*` e O(n) sobre a base inteira e custa requisicoes REST
proporcionais ao numero de alunos - caro no Upstash e lento em Serverless. O
ZSET responde em O(log n + m), onde `m` e so a quantidade de elegiveis.

---

## 5. Financeiro

### `payment:{userId}` - Hash

| Campo | Tipo | Observacao |
|---|---|---|
| `dueDate` | string | `YYYY-MM-DD` - proximo vencimento |
| `lastPaidAt` | string \| null | ISO UTC |
| `status` | string | `em_dia` \| `vence_em_breve` \| `vencida` |
| `planId` | string | `mensal` \| `trimestral` \| `anual` |
| `amountCents` | number | Inteiro, em centavos |

**TTL:** nenhum. O `status` e **derivado** de `dueDate` na leitura (verde / amarelo
em ate 5 dias / vermelho); o campo gravado e so um cache para listagens.

### `payments:history:{userId}` - List

`LPUSH` de JSON: `{ "paidAt": "...", "amountCents": 0, "method": "pix", "registeredBy": "user_2admin...", "coveredUntil": "2025-04-10" }`

### `payments:due` - ZSET **(indice de inadimplentes)**

`member` = `userId`, `score` = `dayNumber(dueDate)`.

```bash
ZRANGEBYSCORE payments:due -inf 20175          # vencidas
ZRANGEBYSCORE payments:due 20176 20180         # vencem nos proximos 5 dias
```

Atualizado junto com `payment:{userId}` sempre que um pagamento e registrado.

---

## 6. Grade de horarios

### `schedule:classes` - String (JSON)

Lida pela landing page via `lib/schedule.ts`, escrita pelo CRUD do Admin.

```json
{
  "classes": [
    {
      "id": "seg-1930-jj",
      "weekday": 1,
      "startTime": "19:30",
      "endTime": "21:00",
      "title": "Jiu-Jitsu",
      "modality": "jiu-jitsu",
      "level": "Iniciante"
    }
  ],
  "updatedAt": "2025-03-01T12:00:00.000Z"
}
```

- `weekday`: 0 = domingo ... 6 = sabado
- `startTime` / `endTime`: `HH:mm` no fuso de Sao Paulo
- **TTL:** nenhum
- A landing page valida cada registro antes de renderizar e cai para
  `data/seed.ts` se a chave nao existir ou o formato nao bater. **A grade e o
  unico dado do Redis que chega a uma pagina publica, e nao contem dado pessoal.**

---

## 7. QR Code da recepcao

### `qr:current` - String com TTL

Token rotativo que impede check-in remoto ou por foto do QR.

- Valor: token aleatorio (`crypto.randomUUID()` ou 32 bytes em base64url)
- **TTL:** `QR_TOKEN_TTL_SECONDS` (padrao 120s)
- A tela da recepcao renova antes de expirar; o endpoint de check-in compara o
  token recebido com `GET qr:current` e recusa se nao bater

### `qr:used:{token}:{userId}` - String com TTL

Defesa extra: impede que o mesmo token seja reaproveitado pelo mesmo aluno
dentro da janela. TTL igual ao do token.

---

## 8. Operacoes atomicas

O cliente Upstash expoe `redis.multi()` (transacao `MULTI`/`EXEC`, tudo ou nada)
e `redis.pipeline()` (so agrupa round-trips). **Use `multi()` quando a
consistencia entre as chaves importa.**

### 8.1 Check-in: lock + ranking + historico

A trava do dia **precisa** ficar fora da transacao, porque e o retorno dela que
decide se o resto roda.

```ts
const day = saoPauloDate(now);              // "2025-03-10"
const month = day.slice(0, 7);              // "2025-03"
const lockKey = `checkin:${userId}:${day}`;

// 1. Trava atomica: so o primeiro SET do dia passa.
const acquired = await redis.set(lockKey, now.toISOString(), {
  nx: true,
  ex: secondsUntilSaoPauloMidnight(now) + 3600,
});

if (acquired === null) {
  return { ok: false, reason: 'ja_fez_checkin_hoje' };
}

// 2. Historico + os quatro rankings, tudo ou nada.
const tx = redis.multi();
tx.zadd(`checkins:${userId}`, { score: now.getTime(), member: now.toISOString() });
tx.zincrby('rank:all', 1, userId);
tx.zincrby(`rank:month:${month}`, 1, userId);
tx.zincrby(`rank:belt:${belt}`, 1, userId);
tx.zincrby(`rank:belt:${belt}:month:${month}`, 1, userId);
tx.expire(`rank:month:${month}`, 60 * 60 * 24 * 400);
tx.expire(`rank:belt:${belt}:month:${month}`, 60 * 60 * 24 * 400);
await tx.exec();
```

Se o `exec()` falhar, a trava do dia fica gravada sem o check-in correspondente.
E o lado seguro do erro (no maximo o aluno perde 1 ponto do dia, nunca ganha
dois); o job de reconciliacao da secao 9 detecta e corrige.

### 8.2 Registrar grau

```ts
const tx = redis.multi();
tx.hset(`user:${userId}`, {
  degree: nextDegree,
  lastGraduationAt: now.toISOString(),
  updatedAt: now.toISOString(),
});
tx.lpush(`graduation:history:${userId}`, JSON.stringify(entry));

if (nextDegree >= KIDS_TOTAL_DEGREES) {
  tx.zrem('graduation:due', userId);                       // vai para avaliacao manual
} else {
  tx.zadd('graduation:due', {
    score: dayNumber(now) + KIDS_GRADUATION_INTERVAL_DAYS,
    member: userId,
  });
}
await tx.exec();
```

O **desfazer** do dashboard e a transacao inversa: restaura `degree` e
`lastGraduationAt` a partir da entrada mais recente do historico, remove essa
entrada (`LPOP`) e reescreve o score em `graduation:due`.

### 8.3 Mudar o status do aluno

```ts
const tx = redis.multi();
tx.srem(`users:by-status:${oldStatus}`, userId);
tx.sadd(`users:by-status:${newStatus}`, userId);
tx.hset(`user:${userId}`, { status: newStatus, updatedAt: now.toISOString() });
if (newStatus === 'ativo' && category === 'kids') {
  tx.zadd('graduation:due', { score: dayNumber(joinedAt) + KIDS_GRADUATION_INTERVAL_DAYS, member: userId });
}
if (newStatus === 'inativo' || newStatus === 'recusado') {
  tx.zrem('graduation:due', userId);
  tx.zrem('payments:due', userId);
}
await tx.exec();
```

### 8.4 Promover de faixa (adulto)

```ts
const tx = redis.multi();
const score = (await redis.zscore('rank:all', userId)) ?? 0;
tx.hset(`user:${userId}`, { belt: newBelt, degree: 0, lastGraduationAt: now.toISOString() });
tx.zrem(`rank:belt:${oldBelt}`, userId);
tx.zadd(`rank:belt:${newBelt}`, { score, member: userId });
tx.lpush(`graduation:history:${userId}`, JSON.stringify(entry));
await tx.exec();
```

---

## 9. Plano de indices

| Pergunta do produto | Indice | Custo |
|---|---|---|
| Quem esta pendente de aprovacao? | `users:by-status:pendente` (Set) | O(n) sobre **os pendentes**, nao sobre a base |
| Quem esta elegivel a grau hoje/este mes? | `graduation:due` (ZSET) | `ZRANGEBYSCORE` O(log n + m) |
| Quem acabou de completar 16 anos? | `graduation:birthdays` (ZSET) | `ZRANGEBYSCORE` O(log n + m) |
| Quem esta inadimplente? | `payments:due` (ZSET) | `ZRANGEBYSCORE` O(log n + m) |
| Quem vence nos proximos 5 dias? | `payments:due` (ZSET, faixa) | `ZRANGEBYSCORE` O(log n + m) |
| Top 3 do mes / posicao do aluno | `rank:month:{YYYY-MM}` | `ZREVRANGE` / `ZREVRANK` O(log n) |
| Frequencia nos ultimos 90 dias | `checkins:{userId}` (ZSET) | `ZCOUNT` O(log n) |
| Historico de graduacoes | `graduation:history:{userId}` (List) | `LRANGE` O(m) |

**Regra geral:** nenhuma tela do Admin pode depender de `SCAN`/`KEYS`. Toda
pergunta "quem esta em tal situacao" vira um ZSET ordenado pela data que define
a situacao.

### Job diario (Vercel Cron, 04:00 America/Sao_Paulo)

1. `ZRANGEBYSCORE graduation:birthdays -inf <hoje>` - marca os que viraram 16,
   troca `category` para `adulto`, remove de `graduation:due` e de
   `graduation:birthdays`.
2. `ZRANGEBYSCORE payments:due -inf <hoje>` - atualiza o `status` em cache nos
   hashes `payment:{userId}`.
3. Reconciliacao amostral: para uma fatia de alunos, confere `ZCARD checkins:{userId}`
   contra `ZSCORE rank:all {userId}` e corrige divergencias da secao 8.1.

---

## 10. Privacidade (LGPD)

- `user:{clerkId}` so e lido em contexto autenticado e autorizado. O CPF nunca
  sai do servidor; telas do Admin recebem no maximo os 3 ultimos digitos.
- `docBlobKey` guarda **o caminho**, nunca uma URL publica. O Admin visualiza o
  documento por uma URL assinada e temporaria, gerada sob demanda.
- `consentVersion` + `consentAt` registram a versao exata da politica aceita.
- Exclusao de conta: `DEL user:{id}`, `checkins:{id}`, `graduation:history:{id}`,
  `payment:{id}`, `payments:history:{id}`; `SREM` do set de status; `ZREM` de
  `rank:*`, `graduation:due`, `graduation:birthdays` e `payments:due`; e remocao
  do blob do documento.
- A unica chave consumida por pagina publica e `schedule:classes`, que nao
  contem dado pessoal.
