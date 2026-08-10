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
          // `name="United States"` is a non-standard attr 
          removeUnknownsAndDefaults: { unknownAttrs: false },
        },
      },
    },
  ],
};
