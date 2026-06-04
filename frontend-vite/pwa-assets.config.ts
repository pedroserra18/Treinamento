import {
  defineConfig,
  minimalPreset as preset,
} from '@vite-pwa/assets-generator/config'

// Configuração do gerador de assets do PWA. Lê o SVG-fonte e produz
// PNG em todos os tamanhos exigidos por iOS, Android e Windows Tiles.
// Roda manualmente com `npx pwa-assets-generator` quando trocarmos o
// ícone de origem — o resultado vai pra public/icons/ e é commitado.
export default defineConfig({
  preset: {
    ...preset,
    apple: {
      // iOS exige fundo opaco (sem transparência) no apple-touch-icon.
      // Usamos a cor brand SerraAthlo como fallback.
      sizes: [180],
      padding: 0,
      resizeOptions: { background: '#FF5A3C' },
    },
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#FF5A3C' },
    },
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
    },
  },
  images: ['public/icons/icon-base.svg'],
})
