import Script from 'next/script';

import { siteConfig } from '@/lib/site';

/**
 * Google Tag Manager.
 *
 * Carrega por `next/script` com `afterInteractive`, e não por uma `<script>`
 * solta: o Next adia a injeção para depois da hidratação, então a tag não
 * disputa banda com o `clerk.browser.js` nem com as fontes na primeira
 * pintura. O alvo de Performance do Lighthouse é 90, e medição que derruba a
 * medida é um mau negócio.
 *
 * A ordem dos dois blocos importa. O inline cria `dataLayer` e empurra o
 * `gtag('js', …)` **antes** de o `gtm.js` chegar; como o externo é assíncrono,
 * ele encontraria a fila pronta de qualquer forma, mas depender disso é
 * depender de corrida.
 *
 * **Fora de produção não carrega.** Em `npm run dev` cada recarga do Fast
 * Refresh viraria sessão na conta da academia, e o relatório do mês passaria
 * a medir o desenvolvimento em vez dos alunos. Para conferir a instalação,
 * use o modo de visualização do próprio GTM contra o site publicado.
 */
export function GoogleTag() {
  const id = siteConfig.googleTagId;

  // Id em branco desliga a tag: é o que permite subir uma cópia do projeto
  // sem mandar dado para a conta da academia.
  if (id.length === 0 || process.env.NODE_ENV !== 'production') return null;

  return (
    <>
      <Script id="google-tag-datalayer" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
      </Script>

      <Script
        id="google-tag-manager"
        src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
    </>
  );
}
