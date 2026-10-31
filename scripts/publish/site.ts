import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toYaml, type Frontmatter } from './vault.ts';

export const REPO = path.resolve(import.meta.dirname, '../..');
const POSTS = 'src/content/thoughts';
const ASSETS = 'src/assets/thoughts';

export const STATUSES = ['undrafted', 'draft', 'published'] as const;
export type Status = (typeof STATUSES)[number];

export const postPath = (slug: string) => path.join(POSTS, `${slug}.md`);
const assetDir = (slug: string) => path.join(ASSETS, slug);

/** Stable, URL-safe asset file name (Obsidian's "Pasted image 2026….png" has spaces). */
export function assetName(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return `${slugify(path.basename(file, path.extname(file)))}${ext}`;
}

/** Absolute path of an image once copied into the repo. */
export const assetFile = (slug: string, file: string) => path.join(REPO, assetDir(slug), assetName(file));

/** `src` for an image as referenced from the post file. */
export function siteImageSrc(slug: string, file: string): string {
  return path.relative(POSTS, path.join(assetDir(slug), assetName(file))).split(path.sep).join('/');
}

/** Writes (or rewrites) the post and its images. Leaves them uncommitted: committing is the review gate. */
export function writePost(slug: string, frontmatter: Frontmatter, markdown: string, images: string[]): string {
  const dir = path.join(REPO, assetDir(slug));
  rmSync(dir, { recursive: true, force: true });
  if (images.length) mkdirSync(dir, { recursive: true });
  for (const image of new Set(images)) copyFileSync(image, assetFile(slug, image));

  const file = path.join(REPO, postPath(slug));
  writeFileSync(file, `---\n${toYaml(frontmatter)}\n---\n\n${markdown}`);
  return file;
}

/** `published` once the post exists on the remote default branch; `draft` while it's only local. */
export function siteStatus(slug: string | undefined): Status {
  if (!slug) return 'undrafted';
  const file = postPath(slug);
  if (git(['cat-file', '-e', `${remoteBranch()}:${file}`]) !== undefined) return 'published';
  return existsSync(path.join(REPO, file)) ? 'draft' : 'undrafted';
}

let branch: string | undefined;
function remoteBranch(): string {
  branch ??= git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])?.trim() || 'origin/main';
  return branch;
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
