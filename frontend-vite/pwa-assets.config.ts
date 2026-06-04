import {
  defineConfig,
  minimalPreset as preset,
} from '@vite-pwa/assets-generator/config'

// Configuração do gerador de assets do PWA. Lê a logo original
// SerraAthlo (icon-source.png) e produz PNG em todos os tamanhos
// exigidos por iOS, Android e Windows Tiles.
//
// Roda manualmente com `npx pwa-assets-generator` quando trocarmos
// o ícone de origem — o resultado vai pra public/icons/ e é commitado.
//
// A logo original é landscape (montanha + texto SERRAATHLO). O gerador
// preserva o aspecto e adiciona fundo branco pra preencher o quadrado.
// Pra maskable (Android adaptive), o padding extra de 30% garante que
// nenhum corte circular ou squircle escondeu parte da logo.
export default defineConfig({
  preset: {
    ...preset,
    apple: {
      // iOS apple-touch-icon (180×180). fit:'contain' preserva o
      // aspecto da logo landscape e usa background pra preencher
      // o resto do quadrado.
      sizes: [180],
      padding: 0.1,
      resizeOptions: { background: '#ffffff', fit: 'contain' },
    },
    maskable: {
      // Android adaptive icon (512×512). Padding maior pra cobrir
      // o corte circular/squircle de Androids variados.
      sizes: [512],
      padding: 0.35,
      resizeOptions: { background: '#ffffff', fit: 'contain' },
    },
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0.1,
      resizeOptions: { background: '#ffffff', fit: 'contain' },
    },
  },
  images: ['public/icons/icon-source.png'],
})
