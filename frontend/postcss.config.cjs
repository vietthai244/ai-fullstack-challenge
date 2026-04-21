// frontend/postcss.config.cjs
// Phase 8 (UI-01): PostCSS config for Tailwind 3.x pipeline.
// .cjs extension forces CommonJS evaluation (Assumption A3 from RESEARCH.md).
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
