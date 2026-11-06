# Contributing to Local PDF Tools

Thanks for taking the time to contribute! 🎉 Bug reports, new tools, docs fixes and translations are all welcome.

## Ground rules

1. **Privacy first.** Browser tools must never send document contents over the network. If a feature truly needs a server, add it to `server.ts`, and label it in the UI as a self-hosted server tool.
2. **No new third-party trackers, analytics or ads.** Ever.
3. Keep pull requests focused: one feature or fix per PR.

## Getting set up

```bash
git clone https://github.com/<your-username>/local-pdf-tools.git
cd local-pdf-tools
npm install
npm run dev          # full app with server, http://localhost:3000
```

Before opening a PR:

```bash
npm run typecheck
npm run build
npx playwright install chromium   # first time only
npm test                          # browser tests
```

Working on the desktop app:

```bash
npm run desktop        # build and launch it
npm run desktop:dist   # build an installer for your OS into release/
```

## Adding a new tool

1. Create `src/components/MyTool.tsx`. Look at a small existing tool such as `FlattenTool.tsx` or `ResizeTool.tsx` for the pattern (`onBack` prop, `Dropzone` for input, download the result with a Blob URL).
2. Add the tool id to the `ActiveTool` union in `src/types.ts`.
3. In `src/App.tsx`:
   - add a lazy import: `const MyTool = React.lazy(() => import('./components/MyTool'));`
   - add an entry to `TOOLS` (title, description, icon, colors)
   - add the id to the right group in `TOOL_GROUPS`
   - add a `case` in `renderActiveTool()`
4. Add the Arabic title and description to `toolsAr` in `src/i18n.tsx` (or leave it and we'll help).
5. Add a browser test in `tests/tools.spec.ts`.
6. Update the feature table in `README.md`.

If you need PDF.js, import `'../lib/pdfjs'` next to your `pdfjs-dist` import so the locally bundled worker is configured.

## Translating

The UI is translated with a tiny built-in system, with no external service or account needed.

- Text in tool screens is wrapped in `tr("English text")`. The English text **is** the key.
  Placeholders look like `tr("Page {0} of {1}", page, total)`.
- Translations live in `src/locales/<lang>.ts` as `{ "English text": "translation" }`.
  Anything missing falls back to English, so partial translations are welcome.
- Dashboard text (tool names, categories, search) lives in `src/i18n.tsx`.

**Improve Arabic:** edit `src/locales/ar.ts` or `src/i18n.tsx` and open a PR.

**Add a language** (e.g. French):
1. Copy `src/locales/ar.ts` to `src/locales/fr.ts` and translate the values.
2. In `src/i18n.tsx`: add `'fr'` to the `Lang` type and `LANGUAGES` (with `dir: 'ltr'` or `'rtl'`),
   add `fr: () => import('./locales/fr')` to `catalogLoaders`, and add dashboard strings.
3. Run `npm run dev`, switch language, and check the screens you touched.

When you add new UI text, wrap it in `tr()`. Use logical Tailwind classes (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`) so layouts work in right-to-left languages.

## Reporting bugs

Use the [bug report form](https://github.com/alqudah/local-pdf-tools/issues/new?template=bug_report.yml). If you can, attach a PDF that reproduces the problem. **Never attach a document containing personal or confidential data.**

## Commit messages

Short, imperative subject lines, e.g. `Add PDF to EPUB tool` or `Fix rotation of landscape pages in Merge`.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).

## Releasing (maintainers)

1. Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` and bump `version` in `package.json`.
2. Merge to `main`.
3. Run **Actions → Release → Run workflow** with the version (e.g. `1.1.0`). It tags `main` and publishes a GitHub release using that CHANGELOG section.
