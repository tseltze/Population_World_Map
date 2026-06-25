// SVGO config tuned for the interactive world map.
// The app keys off each <path>'s `id` (ISO code) and `name` attributes, so the
// plugins that would strip or rewrite those are disabled.
module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false, // country ids (e.g. "us") drive selection
          mergePaths: false, // keep one path per country
          removeViewBox: false, // needed for responsive scaling + zoom
          // `name="United States"` is a non-standard attr we rely on
          removeUnknownsAndDefaults: { unknownAttrs: false },
        },
      },
    },
  ],
};
