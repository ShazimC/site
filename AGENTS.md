## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Conventions

### Design tokens

- Never hardcode sizes, colors, timings, easings, radii, borders, shadows or letter spacing. Use the tokens in `src/styles/tokens.css`.
- Add a value to `tokens.css` only if it is reused globally. One-off values stay as local custom properties in the component (e.g. `--dot`, `--bleed`).

### Responsive / mobile (required for every UI change)

- Breakpoints are `@custom-media` in `src/styles/media.css`: `--sm`, `--md`, `--lg`, `--xl` (min-width), `--md-down` (max-width), `--can-hover` (real hover pointer). Never write raw `min-width`/`max-width` queries.
- Components are fluid: they fill the width their parent gives them and never set their own fixed width. The parent page owns the layout (grid, row, stack) and passes image `sizes` to match it.
- Nothing may be cut off or require sideways scrolling to discover on small screens. Prefer stacking over horizontal carousels below `--md`.
- Hover-only effects (scale, lift, color change on hover) go inside `@media (--can-hover)` so they don't stick after a tap on touch devices. Mirror them on `:focus-visible` for keyboard users.
- Respect `prefers-reduced-motion` for any transition or animation.
- Verify in a browser at 320px, 390px, 768px and 1280px, in light and dark mode, before calling a UI change done. Check the document doesn't scroll horizontally (`document.documentElement.scrollWidth === innerWidth`).

## Publishing

Thoughts posts are generated from Obsidian by `scripts/publish/` (see its README). Don't hand-edit generated posts in `src/content/thoughts/`; edit the source note and re-run `pnpm publish:draft`.

After changing a collection schema in `src/content.config.ts`, run `npx astro sync --force` and restart the dev server; otherwise the content cache keeps entries parsed with the old schema.
