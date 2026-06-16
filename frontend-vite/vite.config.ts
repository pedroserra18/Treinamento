import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// PWA setup detalhado:
//   • Manifest com brand SerraAthlo (cor #FF5A3C, display standalone)
//   • Service Worker via injectManifest (não generateSW) pra ter
//     controle total sobre estratégias e push handlers
//   • `registerType: 'prompt'` deixa o app decidir QUANDO mostrar a
//     notificação de "nova versão" — vamos usar isso na UI
//   • Inclui pwa-512.png, maskable, apple-touch — todos pré-gerados
//     pelo `pwa-assets-generator` (rodar `npx pwa-assets-generator`
//     se trocar o icon-base.svg)
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'SerraAthlo',
        short_name: 'SerraAthlo',
        description: 'Treine. Acompanhe. Evolua.',
        theme_color: '#FF5A3C',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?source=pwa',
        scope: '/',
        // Preferir abrir links dentro do escopo no app instalado em vez do
        // navegador (ex.: link /shared/:token). Suportado em Chromium
        // (Android/desktop); iOS ignora — lá o link sempre abre no Safari.
        handle_links: 'preferred',
        // Ao abrir um link com o app já aberto, foca a janela existente em vez
        // de criar outra instância.
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['health', 'fitness', 'lifestyle', 'sports'],
        icons: [
          {
            src: 'icons/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Limite alto pra cobrir bundle de TrainPage (~85kb minified)
        // sem cortar nada do precache.
        maximumFileSizeToCacheInBytes: 5_000_000,
      },
      devOptions: {
        // SW desligado em dev pra não atrapalhar HMR.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
  },
})
