import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Document, isMap, parseDocument, stringify } from 'yaml';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export type Frontmatter = Record<string, unknown>;

export interface Note {
  file: string;
  data: Frontmatter;
  body: string;
}

export function readNote(file: string): Note {
  const raw = readFileSync(file, 'utf8');
  const match = raw.match(FRONTMATTER);
  if (!match) return { file, data: {}, body: raw };
  const data = parseDocument(match[1]).toJS() ?? {};
  return { file, data, body: raw.slice(match[0].length) };
}

/** Merges `patch` into a note's frontmatter, keeping the rest of the YAML (order, comments) as written. `undefined` deletes a key. */
export function updateFrontmatter(file: string, patch: Frontmatter): void {
  const raw = readFileSync(file, 'utf8');
  const match = raw.match(FRONTMATTER);
  const parsed = parseDocument(match?.[1] ?? '');
  const doc: Document = isMap(parsed.contents) ? parsed : new Document({});

  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    const current = doc.get(key);
    if (value === undefined) {
      if (doc.has(key)) (doc.delete(key), (changed = true));
    } else if (current !== value) {
      doc.set(key, value);
      changed = true;
    }
  }
  if (!changed) return;

  const body = match ? raw.slice(match[0].length) : raw;
  writeFileSync(file, `---\n${doc.toString().trimEnd()}\n---\n${body}`);
}

export const toYaml = (data: Frontmatter) => stringify(data).trimEnd();

/** Nearest ancestor folder containing `.obsidian`. */
export function findVaultRoot(file: string): string {
  let dir = path.dirname(path.resolve(file));
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.obsidian'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`${file} isn't inside an Obsidian vault (no .obsidian folder found above it).`);
}

/** Vault file index with Obsidian-style link resolution. */
export class Vault {
  readonly root: string;
  readonly files: string[];

  constructor(root: string) {
    this.root = root;
    this.files = walk(root).map((file) => path.relative(root, file));
  }

  /**
   * Resolves a wikilink or relative link target (`Note`, `Folder/Note`, `image.png`) like Obsidian does:
   * exact path first, then the closest match by name, preferring the linking note's folder.
   */
  resolve(target: string, fromFile: string): string | undefined {
    const clean = decodeURIComponent(target).replace(/[#|^].*$/, '').trim();
    if (!clean) return undefined;
    const withExt = path.extname(clean) ? clean : `${clean}.md`;
    const fromDir = path.relative(this.root, path.dirname(fromFile));

    const relative = path.normalize(path.join(fromDir, withExt));
    if (this.files.includes(relative)) return path.join(this.root, relative);
    if (this.files.includes(withExt)) return path.join(this.root, withExt);

    const suffix = `${path.sep}${withExt}`.toLowerCase();
    const matches = this.files.filter(
      (file) => file.toLowerCase() === withExt.toLowerCase() || file.toLowerCase().endsWith(suffix),
    );
    const best = matches.sort(
      (a, b) =>
        Number(path.dirname(b) === fromDir) - Number(path.dirname(a) === fromDir) || a.length - b.length,
    )[0];
    return best && path.join(this.root, best);
  }

  notes(): Note[] {
    return this.files.filter((file) => file.endsWith('.md')).map((file) => readNote(path.join(this.root, file)));
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
