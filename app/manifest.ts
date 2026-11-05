import type { MetadataRoute } from 'next';

import { siteConfig } from '@/lib/site';

/**
 * Manifesto do app.
 *
 * O que ele resolve: o atalho na tela de início abre em janela própria, sem a
 * barra do navegador, e com o nome da academia em vez da URL. O aluno usa o
 * painel três vezes por semana na porta do tatame — a barra de endereço ali
 * só rouba altura da tela e um toque a mais para chegar ao QR.
 *
 * O ícone do iPhone **não** sai daqui: o iOS lê `apple-icon.png`
 * (`app/apple-icon.png`, convenção do App Router) e ignora este arquivo para
 * o atalho. Os ícones abaixo servem ao Android e ao Chrome no desktop.
 *
 * `start_url` aponta para `/entrando`, e não para a raiz: quem instala o
 * atalho é aluno ou professor, e essa rota lê o papel da conta e manda cada um
 * para o painel dele. Abrir na landing obrigaria a procurar o botão de entrar
 * toda vez.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — Jiu-Jitsu e MMA`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: '/entrando',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E0E10',
    theme_color: '#0E0E10',
    lang: 'pt-BR',
    categories: ['sports', 'health', 'education'],
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        // `any` e não `maskable`: a arte tem o emblema perto da borda, e o
        // recorte circular do Android comeria parte dele.
        purpose: 'any',
      },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
