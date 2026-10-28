/** @type {import('next').NextConfig} */
module.exports = {
  // Lets a second dev server (e.g. a verification copy on another port) use
  // its own build folder instead of fighting over .next with the main one.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The read-aloud voice model (kokoro-js / transformers.js) runs in the
  // browser; its Node-only parts must not be bundled.
  webpack: (config, { webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      'onnxruntime-node$': false,
    };
    // onnxruntime-web ships a ready-made .mjs that Terser can't re-parse.
    // onnxruntime-web ships a ready-made .mjs that Terser can't re-parse;
    // mark it as already minified so the minifier leaves it alone.
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.thisCompilation.tap('SkipOrtMinify', (compilation) => {
          compilation.hooks.processAssets.tap(
            { name: 'SkipOrtMinify', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS },
            (assets) => {
              for (const name of Object.keys(assets)) {
                if (/ort[^/]*\.mjs$/.test(name)) compilation.updateAsset(name, assets[name], { minimized: true });
              }
            },
          );
        });
      },
    });
    return config;
  },
};
