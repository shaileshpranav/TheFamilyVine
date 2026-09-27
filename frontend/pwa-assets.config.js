// App icons for the installable app, made from the favicon by `npm run gen:icons`.
// iPhone and Android crop icons to their own shape, so those two get the favicon's
// black filling the whole square; the others keep its rounded corners.
export default {
  images: ['public/favicon.svg'],
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [] },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#111111' } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background: '#111111' } },
  },
}
