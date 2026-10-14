import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // Os repositórios marcam `server-only` para que um import no cliente
      // quebre o build. Esse mesmo guard impediria o Vitest de carregá-los, e
      // sem isso não dá para testar a camada de dados de verdade.
      'server-only': fileURLToPath(new URL('./test/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Cada arquivo sobe o seu próprio Redis de teste; isolar evita que um
    // teste enxergue chaves de outro.
    pool: 'forks',
  },
});
