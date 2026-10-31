/**
 * Obsidian → site / Substack / Medium drafts. Usage (from the repo root):
 *   pnpm publish:draft <note.md>...  [--force]   Create or update the site + Substack drafts
 *   pnpm publish:status [note.md...]             Refresh statuses (all queued notes by default)
 *   pnpm publish:medium <note.md>                Open Medium's importer for a live post
 * Add --json for machine-readable output (used by the Obsidian plugin).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { SITE_URL } from '../../src/lib/site.ts';
import { convert, siteTarget, substackTarget } from './convert.ts';
import { assetFile, postPath, siteImageSrc, siteStatus, slugify, writePost, type Status } from './site.ts';
import { draftStatuses, upsertDraft } from './substack.ts';
import { Vault, findVaultRoot, readNote, updateFrontmatter, type Note } from './vault.ts';

const ENV = path.join(import.meta.dirname, '.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);

const DEV_URL = 'http://localhost:4321';
const MEDIUM_IMPORT = 'https://medium.com/p/import';
const DESCRIPTION_LENGTH = 160;

interface Result {
  note: string;
  slug?: string;
  site?: Status;
  substack?: Status;
  medium?: Status;
  rough?: boolean;
  urls: { site?: string; preview?: string; substack?: string };
  errors: string[];
  messages: string[];
}

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: 'boolean' }, force: { type: 'boolean' } },
});
const [command, ...files] = positionals;

const commands: Record<string, () => Promise<Result[] | object>> = {
  draft: async () => required(files).map((file) => attempt(file, () => draft(file))),
  status: async () => status(files.length ? files : queuedNotes()),
  medium: async () => Promise.all(required(files).map((file) => medium(file).catch((error) => failed(file, error)))),
  config: async () => ({ siteUrl: SITE_URL, devUrl: DEV_URL, substackUrl: process.env.SUBSTACK_PUBLICATION_URL }),
};

const run = commands[command ?? ''];
if (!run) {
  console.error('Usage: cli.ts <draft|status|medium|config> [note.md...] [--force] [--json]');
  process.exit(1);
}
let output: Result[] | object;
try {
  output = await run();
} catch (error) {
  if (flags.json) console.log(JSON.stringify({ error: (error as Error).message }));
  else console.error((error as Error).message);
  process.exit(1);
}
if (flags.json) console.log(JSON.stringify(output));
else if (Array.isArray(output)) output.forEach(report);
else console.log(output);
if (Array.isArray(output) && output.some((result) => result.errors.length)) process.exitCode = 1;

function draft(file: string): Result {
  const result = newResult(file);
  const note = readNote(file);
  const vault = new Vault(findVaultRoot(file));
  const slugs = publishedSlugs(vault);

  const preview = convert(note.body, file, vault, siteTarget({ linkFor: () => undefined, imageSrc: (f) => f }));
  const title = str(note.data.title) ?? preview.heading ?? path.basename(file, '.md');
  const slug = str(note.data.slug) ?? slugify(title);
  if (!slug) throw new Error(`Can't make a URL slug from "${title}". Add a \`slug\` property to the note.`);
  slugs.set(path.resolve(file), slug);
  const date = str(note.data.date) ?? new Date().toLocaleDateString('en-CA');
  const description = str(note.data.description) ?? summarize(preview.lede ?? '');
  const rough = isRough(note);
  Object.assign(result, { slug });

  const site = convert(
    note.body,
    file,
    vault,
    siteTarget({
      linkFor: (target) => slugs.has(target) ? `/thoughts/${slugs.get(target)}/` : undefined,
      imageSrc: (image) => siteImageSrc(slug, image),
    }),
  );
  writePost(slug, { title, description, date, rough }, site.markdown, site.images);
  result.site = siteStatus(slug);
  result.messages.push(`Site: wrote ${postPath(slug)} (uncommitted)`);

  const patch: Record<string, unknown> = { ...defaults(note), publish: true, slug, date, description, site: result.site };
  try {
    const substack = convert(
      note.body,
      file,
      vault,
      substackTarget({
        linkFor: (target) => (slugs.has(target) ? `${SITE_URL}/thoughts/${slugs.get(target)}/` : undefined),
        imageSrc: (image) => assetFile(slug, image),
      }),
    );
    const response = upsertDraft({
      title,
      subtitle: description,
      slug,
      markdown: substack.markdown,
      draft_id: num(note.data.substack_id),
      revision: str(note.data.substack_revision),
      force: flags.force,
    });
    Object.assign(patch, {
      substack: response.status,
      substack_id: response.draft_id,
      substack_revision: response.revision,
      substack_url: response.url,
    });
    result.substack = response.status === 'missing' ? 'undrafted' : response.status;
    result.messages.push(response.skipped ?? `Substack: ${note.data.substack_id ? 'updated' : 'created'} draft`);
  } catch (error) {
    result.errors.push(`Substack: ${(error as Error).message}`);
  }

  updateFrontmatter(file, patch);
  return withUrls(result, readNote(file));
}

function status(noteFiles: string[]): Result[] {
  const notes = noteFiles.map((file) => readNote(file));
  const ids = notes.map((note) => num(note.data.substack_id)).filter((id) => id !== undefined);
  let remote: ReturnType<typeof draftStatuses> = {};
  let substackError: string | undefined;
  try {
    if (ids.length) remote = draftStatuses(ids);
  } catch (error) {
    substackError = (error as Error).message;
  }

  return notes.map((note) => attempt(note.file, () => {
    const result = newResult(note.file);
    const patch: Record<string, unknown> = { ...defaults(note), site: siteStatus(str(note.data.slug)) };

    const id = num(note.data.substack_id);
    if (id !== undefined && substackError) result.errors.push(`Substack: ${substackError}`);
    const draft = id !== undefined ? remote[String(id)] : undefined;
    if (draft?.status === 'missing') {
      Object.assign(patch, { substack: 'undrafted', substack_id: undefined, substack_revision: undefined, substack_url: undefined });
      result.messages.push('Substack: draft was deleted; it will be recreated on the next draft run');
    } else if (draft) {
      Object.assign(patch, { substack: draft.status, substack_url: draft.url });
      if (draft.status === 'published') patch.substack_revision = undefined;
    }

    updateFrontmatter(note.file, patch);
    return withUrls(result, readNote(note.file));
  }));
}

async function medium(file: string): Promise<Result> {
  const result = newResult(file);
  const note = readNote(file);
  const slug = str(note.data.slug);
  if (!slug || siteStatus(slug) !== 'published') {
    result.errors.push('Medium: push the site post first. Medium imports from the live page.');
    return withUrls(result, note);
  }

  const url = `${SITE_URL}/thoughts/${slug}/`;
  const live = await fetch(url, { method: 'HEAD' }).then((response) => response.ok, () => false);
  if (!live) {
    result.errors.push(`Medium: ${url} isn't live yet. Wait for the deploy to finish.`);
    return withUrls(result, note);
  }

  execFileSync('pbcopy', { input: url });
  execFileSync('open', [MEDIUM_IMPORT]);
  updateFrontmatter(file, { ...defaults(note), ...(note.data.medium !== 'published' && { medium: 'draft' }) });
  result.messages.push('Medium: post URL copied. Paste it into the importer and click Import to create the draft.');
  return withUrls(result, readNote(file));
}

/** Notes marked `publish: true` in the vault from OBSIDIAN_VAULT. */
function queuedNotes(): string[] {
  const root = process.env.OBSIDIAN_VAULT;
  if (!root) throw new Error('Pass note paths or set OBSIDIAN_VAULT in scripts/publish/.env');
  return new Vault(root).notes().filter((note) => note.data.publish === true).map((note) => note.file);
}

/** Vault notes that already have a site slug, so links between them survive publishing. */
function publishedSlugs(vault: Vault): Map<string, string> {
  return new Map(
    vault
      .notes()
      .filter((note) => note.data.publish === true && str(note.data.slug))
      .map((note) => [path.resolve(note.file), String(note.data.slug)]),
  );
}

function withUrls(result: Result, note: Note): Result {
  const slug = str(note.data.slug);
  result.slug = slug;
  result.site = note.data.site as Status;
  result.substack = note.data.substack as Status;
  result.medium = note.data.medium as Status;
  result.rough = note.data.rough === true;
  if (slug) {
    result.urls.site = `${SITE_URL}/thoughts/${slug}/`;
    result.urls.preview = `${DEV_URL}/thoughts/${slug}/`;
  }
  result.urls.substack = str(note.data.substack_url);
  return result;
}

function report(result: Result) {
  console.log(`\n${path.basename(result.note, '.md')}${result.slug ? ` → /thoughts/${result.slug}/` : ''}`);
  console.log(`  ${result.rough ? 'rough · ' : ''}site: ${result.site ?? '–'} · substack: ${result.substack ?? '–'} · medium: ${result.medium ?? '–'}`);
  result.messages.forEach((message) => console.log(`  ✓ ${message}`));
  result.errors.forEach((error) => console.log(`  ✗ ${error}`));
  if (result.site === 'draft' && result.urls.preview) console.log(`  Preview: ${result.urls.preview}`);
  if (result.urls.substack) console.log(`  Substack: ${result.urls.substack}`);
}

function summarize(text: string): string {
  if (text.length <= DESCRIPTION_LENGTH) return text;
  const cut = text.slice(0, DESCRIPTION_LENGTH);
  const sentence = cut.lastIndexOf('. ');
  return sentence > DESCRIPTION_LENGTH / 2 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Note paths are relative to where `pnpm` was run; a bare note name is looked up in OBSIDIAN_VAULT. */
function required(list: string[]): string[] {
  if (!list.length) throw new Error('Pass at least one note path or name.');
  const cwd = process.env.INIT_CWD ?? process.cwd();
  return list.map((entry) => {
    const file = path.resolve(cwd, entry);
    if (existsSync(file)) return file;
    const root = process.env.OBSIDIAN_VAULT;
    const found = root && new Vault(root).resolve(entry, path.join(root, '_'));
    if (!found) throw new Error(`Note not found: ${entry}`);
    return found;
  });
}

function attempt(file: string, task: () => Result): Result {
  try {
    return task();
  } catch (error) {
    return failed(file, error);
  }
}

function failed(file: string, error: unknown): Result {
  return { ...newResult(file), errors: [(error as Error).message] };
}

/** Every tracked note always shows all three platforms and the rough checkbox; fills in whichever are missing. */
function defaults(note: Note): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const platform of ['site', 'substack', 'medium']) if (!str(note.data[platform])) patch[platform] = 'undrafted';
  if (note.data.rough === undefined || note.data.rough === null) patch.rough = false;
  return patch;
}

function isRough(note: Note): boolean {
  const { rough } = note.data;
  if (rough === undefined || rough === null) return false;
  if (typeof rough !== 'boolean') throw new Error(`\`rough\` must be a checkbox (true/false), not "${rough}".`);
  return rough;
}

function newResult(note: string): Result {
  return { note, urls: {}, errors: [], messages: [] };
}

/** Non-empty string property (YAML dates come back as Date objects). */
function str(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
