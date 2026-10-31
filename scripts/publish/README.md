# Publishing pipeline

Obsidian notes are the source of truth. One action creates **drafts** on three platforms; you review and publish each yourself.

| Platform | Draft | You publish by |
| --- | --- | --- |
| Site | `src/content/thoughts/<slug>.md` + images in `src/assets/thoughts/<slug>/` (uncommitted) | Reviewing at `localhost:4321`, then commit + push |
| Substack | Draft via `python-substack` (unofficial; cookie auth) | Publishing in the Substack editor |
| Medium | “Import a story” with the live site URL (sets canonical link) | Publishing in Medium, then **Mark Medium published** in the sidebar |

State lives in each note’s frontmatter (`publish`, `rough`, `slug`, `date`, `description`, `site`, `substack`, `substack_*`, `medium`).

- `site` / `substack` / `medium`: always present. `undrafted` (nothing yet) → `draft` (ready for review) → `published` (live). Site and Substack are detected; Medium is set from the sidebar chip.
- `rough`: checkbox, unchecked by default; tick it in the note’s properties or the sidebar. Rough posts get a “rough thought” mark in the thoughts list and on the post. Re-run drafts after changing it. Set `title`, `slug` or `description` yourself to override the defaults (leading H1 or file name; slugified title; first paragraph).

## Setup (once)

1. `pnpm install && pnpm publish:setup` (Python venv + `python-substack`).
2. `cp scripts/publish/.env.example scripts/publish/.env` and fill `SUBSTACK_COOKIES`: sign in to substack.com → DevTools → Network → any request → copy the full `cookie` request header. Re-copy when it expires.
3. Obsidian → Settings → Community plugins → turn off Restricted mode → enable **Portfolio Publisher**. The plugin lives in `obsidian-plugin/`, symlinked to `<vault>/.obsidian/plugins/portfolio-publisher`.

## Workflow

1. Right-click a note → **Add to publishing** (or `+` in the Publishing sidebar).
2. **Create drafts** → review the site preview and Substack draft. Re-run any time to update; Substack drafts edited in its editor are not overwritten unless you pass `--force`.
3. Commit + push the site post → **Refresh** → Site turns “published”.
4. **Medium import** → copies the URL and opens Medium’s import page → publish there → Medium chip → **Mark Medium published**.

## CLI

```sh
pnpm publish:draft "<note path or name>" [--force]
pnpm publish:status [notes…]        # defaults to every note with publish: true
pnpm publish:medium "<note>"
```

Wikilinks to other published notes become site links; links to unpublished notes become plain text. Highlights render as `<mark>` on the site and bold on Substack. Changing `SITE_URL` in `src/lib/site.ts` updates every platform’s links.
