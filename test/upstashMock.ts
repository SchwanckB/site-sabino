import { createServer, type Server } from 'node:http';

/**
 * Redis em memória que fala o protocolo REST do Upstash.
 *
 * Existe porque testar só a lógica pura deixou passar erros que só apareciam
 * com banco de verdade — `-Infinity` virando `null` no JSON foi um deles. Com
 * este servidor os testes exercitam os repositórios reais, com os mesmos
 * comandos, a mesma serialização e os mesmos tipos de retorno.
 *
 * Implementa apenas os comandos que a aplicação usa. Qualquer comando novo
 * falha alto, de propósito: é melhor o teste quebrar do que fingir que passou.
 */

type Entry =
  | { kind: 'string'; value: string }
  | { kind: 'hash'; value: Map<string, string> }
  | { kind: 'set'; value: Set<string> }
  | { kind: 'zset'; value: Map<string, number> }
  | { kind: 'list'; value: string[] };

export class UpstashMock {
  private readonly store = new Map<string, Entry>();
  private readonly expiry = new Map<string, number>();
  private server: Server | null = null;
  private port = 0;

  /** Comandos executados, para asserções sobre o que foi enviado de fato. */
  readonly log: string[][] = [];

  async start(port = 0): Promise<{ url: string; token: string }> {
    this.server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        let payload: unknown;
        try {
          payload = body.length > 0 ? JSON.parse(body) : [];
        } catch {
          response.writeHead(400).end(JSON.stringify({ error: 'JSON inválido' }));
          return;
        }

        const path = request.url ?? '/';
        const base64 =
          String(request.headers['upstash-encoding'] ?? '').toLowerCase() === 'base64';
        const out = (value: unknown): unknown => (base64 ? this.encode(value) : value);
        response.writeHead(200, { 'Content-Type': 'application/json' });

        try {
          if (path.includes('pipeline') || path.includes('multi-exec')) {
            const commands = payload as unknown[][];
            const results = commands.map((command) => {
              try {
                return { result: out(this.run(command)) };
              } catch (error) {
                return { error: (error as Error).message };
              }
            });
            response.end(JSON.stringify(results));
            return;
          }

          response.end(JSON.stringify({ result: out(this.run(payload as unknown[])) }));
        } catch (error) {
          response.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(port, '127.0.0.1', resolve);
    });

    const address = this.server.address();
    this.port = typeof address === 'object' && address ? address.port : 0;

    return { url: `http://127.0.0.1:${this.port}`, token: 'test-token' };
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  reset(): void {
    this.store.clear();
    this.expiry.clear();
    this.log.length = 0;
  }

  /** TTL restante em segundos, para asserções sobre expiração. */
  ttlOf(key: string): number {
    const at = this.expiry.get(key);
    if (at === undefined) return -1;
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  /**
   * O cliente envia `Upstash-Encoding: base64` por padrão e decodifica tudo
   * que volta. Sem honrar isso, as strings chegam embaralhadas — foi o que
   * aconteceu na primeira execução dos testes.
   */
  private encode(value: unknown): unknown {
    if (typeof value === 'string') return Buffer.from(value, 'utf8').toString('base64');
    if (Array.isArray(value)) return value.map((item) => this.encode(item));
    return value;
  }

  private sweep(key: string): void {
    const at = this.expiry.get(key);
    if (at !== undefined && at <= Date.now()) {
      this.store.delete(key);
      this.expiry.delete(key);
    }
  }

  private read(key: string): Entry | undefined {
    this.sweep(key);
    return this.store.get(key);
  }

  private hash(key: string): Map<string, string> {
    const found = this.read(key);
    if (found?.kind === 'hash') return found.value;
    const created = new Map<string, string>();
    this.store.set(key, { kind: 'hash', value: created });
    return created;
  }

  private set_(key: string): Set<string> {
    const found = this.read(key);
    if (found?.kind === 'set') return found.value;
    const created = new Set<string>();
    this.store.set(key, { kind: 'set', value: created });
    return created;
  }

  private zset(key: string): Map<string, number> {
    const found = this.read(key);
    if (found?.kind === 'zset') return found.value;
    const created = new Map<string, number>();
    this.store.set(key, { kind: 'zset', value: created });
    return created;
  }

  private list(key: string): string[] {
    const found = this.read(key);
    if (found?.kind === 'list') return found.value;
    const created: string[] = [];
    this.store.set(key, { kind: 'list', value: created });
    return created;
  }

  /** `-inf` / `+inf` / número. É aqui que `null` seria pego. */
  private score(raw: unknown, label: string): number {
    if (raw === '-inf') return Number.NEGATIVE_INFINITY;
    if (raw === '+inf' || raw === 'inf') return Number.POSITIVE_INFINITY;

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (raw === null || raw === undefined || Number.isNaN(parsed)) {
      // Mesma mensagem do Redis real.
      throw new Error(`ERR ${label} is not a float`);
    }
    return parsed;
  }

  private sortedMembers(key: string): { member: string; score: number }[] {
    return [...this.zset(key).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.member.localeCompare(b.member)));
  }

  private run(command: unknown[]): unknown {
    const name = String(command[0] ?? '').toLowerCase();
    const args = command.slice(1);
    this.log.push(command.map((part) => String(part)));

    const key = String(args[0] ?? '');

    switch (name) {
      case 'set': {
        const value = String(args[1]);
        const rest = args.slice(2).map((a) => String(a).toLowerCase());

        if (rest.includes('nx') && this.read(key) !== undefined) return null;
        if (rest.includes('xx') && this.read(key) === undefined) return null;

        this.store.set(key, { kind: 'string', value });
        this.expiry.delete(key);

        const exIndex = rest.indexOf('ex');
        if (exIndex >= 0) {
          const seconds = Number(rest[exIndex + 1]);
          if (Number.isFinite(seconds)) this.expiry.set(key, Date.now() + seconds * 1000);
        }
        return 'OK';
      }

      case 'get': {
        const found = this.read(key);
        return found?.kind === 'string' ? found.value : null;
      }

      case 'del': {
        let removed = 0;
        for (const raw of args) {
          if (this.store.delete(String(raw))) removed += 1;
          this.expiry.delete(String(raw));
        }
        return removed;
      }

      case 'ttl': {
        if (this.read(key) === undefined) return -2;
        return this.expiry.has(key) ? this.ttlOf(key) : -1;
      }

      case 'expire': {
        if (this.read(key) === undefined) return 0;
        this.expiry.set(key, Date.now() + Number(args[1]) * 1000);
        return 1;
      }

      case 'hset': {
        const hash = this.hash(key);
        let added = 0;
        // O cliente manda pares achatados: campo, valor, campo, valor...
        for (let index = 1; index < args.length; index += 2) {
          const field = String(args[index]);
          if (!hash.has(field)) added += 1;
          hash.set(field, String(args[index + 1]));
        }
        return added;
      }

      case 'hgetall': {
        const found = this.read(key);
        // Chave inexistente devolve lista vazia, nunca null: o cliente chama
        // `.length` no retorno e quebraria.
        if (found?.kind !== 'hash') return [];
        // O Upstash devolve a lista achatada; o cliente remonta o objeto.
        return [...found.value.entries()].flat();
      }

      case 'sadd': {
        const target = this.set_(key);
        let added = 0;
        for (const raw of args.slice(1)) {
          const member = String(raw);
          if (!target.has(member)) {
            target.add(member);
            added += 1;
          }
        }
        return added;
      }

      case 'srem': {
        const target = this.set_(key);
        let removed = 0;
        for (const raw of args.slice(1)) {
          if (target.delete(String(raw))) removed += 1;
        }
        return removed;
      }

      case 'smembers':
        return [...this.set_(key)];

      case 'scard':
        return this.set_(key).size;

      case 'zadd': {
        const target = this.zset(key);
        let added = 0;
        for (let index = 1; index < args.length; index += 2) {
          const score = this.score(args[index], 'score');
          const member = String(args[index + 1]);
          if (!target.has(member)) added += 1;
          target.set(member, score);
        }
        return added;
      }

      case 'zincrby': {
        const target = this.zset(key);
        const by = this.score(args[1], 'increment');
        const member = String(args[2]);
        const next = (target.get(member) ?? 0) + by;
        target.set(member, next);
        return next;
      }

      case 'zrem': {
        const target = this.zset(key);
        let removed = 0;
        for (const raw of args.slice(1)) {
          if (target.delete(String(raw))) removed += 1;
        }
        return removed;
      }

      case 'zscore': {
        const value = this.zset(key).get(String(args[1]));
        return value === undefined ? null : value;
      }

      case 'zcard':
        return this.zset(key).size;

      case 'zrevrank': {
        const descending = this.sortedMembers(key).reverse();
        const position = descending.findIndex((item) => item.member === String(args[1]));
        return position < 0 ? null : position;
      }

      case 'zrange': {
        const flags = args.slice(3).map((a) => String(a).toLowerCase());
        const byScore = flags.includes('byscore');
        const rev = flags.includes('rev');
        const withScores = flags.includes('withscores');

        let members = this.sortedMembers(key);

        if (byScore) {
          // Em REV o cliente inverte min/max; normaliza para comparar.
          const a = this.score(args[1], 'min or max');
          const b = this.score(args[2], 'min or max');
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          members = members.filter((item) => item.score >= min && item.score <= max);
          if (rev) members.reverse();
        } else {
          if (rev) members.reverse();
          const start = Number(args[1]);
          const stop = Number(args[2]);
          const end = stop < 0 ? members.length + stop + 1 : stop + 1;
          members = members.slice(start < 0 ? members.length + start : start, end);
        }

        return withScores
          ? members.flatMap((item) => [item.member, item.score])
          : members.map((item) => item.member);
      }

      case 'lpush': {
        const target = this.list(key);
        for (const raw of args.slice(1)) target.unshift(String(raw));
        return target.length;
      }

      case 'rpush': {
        const target = this.list(key);
        for (const raw of args.slice(1)) target.push(String(raw));
        return target.length;
      }

      case 'lpop': {
        const target = this.list(key);
        return target.shift() ?? null;
      }

      case 'lrange': {
        const target = this.list(key);
        const start = Number(args[1]);
        const stop = Number(args[2]);
        const end = stop < 0 ? target.length + stop + 1 : stop + 1;
        return target.slice(start < 0 ? target.length + start : start, end);
      }

      default:
        // Falha alto: um comando não implementado não pode passar por "ok".
        throw new Error(`ERR comando não suportado pelo mock: ${name}`);
    }
  }
}
