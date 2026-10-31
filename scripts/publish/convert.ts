import type { Blockquote, Image, Link, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import path from 'node:path';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import type { Vault } from './vault.ts';

/** Stand-in for a hard line break in Substack output; `substack_bridge.py` turns it back into a real one. */
export const SUBSTACK_LINE_BREAK = '\u2028';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
const OBSIDIAN_INLINE = /(!?)\[\[([^\]\n]+?)\]\]|==([^=\n]+?)==/g;
const BLOCK_ID = /\s+\^[\w-]+$/;
const CALLOUT = /^\[!(\w+)\][+-]?[ \t]*(.*)$/;

export interface Target {
  /** URL for a linked vault note, or undefined to render it as plain text (note isn't published). */
  linkFor(notePath: string): string | undefined;
  /** Output `src` for a local image. */
  imageSrc(imagePath: string): string;
  highlight(text: string): PhrasingContent;
  lineBreak: StringifyOptions['handlers'];
}

export const siteTarget = (target: Omit<Target, 'highlight' | 'lineBreak'>): Target => ({
  ...target,
  highlight: (text) => ({ type: 'html', value: `<mark>${escapeHtml(text)}</mark>` }),
  lineBreak: {},
});

export const substackTarget = (target: Omit<Target, 'highlight' | 'lineBreak'>): Target => ({
  ...target,
  // python-substack 0.10 has no highlight mark; bold keeps the emphasis.
  highlight: (text) => ({ type: 'strong', children: [{ type: 'text', value: text }] }),
  lineBreak: { break: () => SUBSTACK_LINE_BREAK },
});

export interface Converted {
  markdown: string;
  /** Text of the leading `# Heading`, removed from the body because the page renders the title. */
  heading?: string;
  /** First paragraph as plain text, for a fallback description. */
  lede?: string;
  images: string[];
}

/** Converts an Obsidian note body into portable Markdown for one target. */
export function convert(body: string, file: string, vault: Vault, target: Target): Converted {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(body.replace(/%%[\s\S]*?%%/g, '')) as Root;

  let heading: string | undefined;
  const first = tree.children[0];
  if (first?.type === 'heading' && first.depth === 1) {
    heading = plainText(first);
    tree.children.shift();
  }

  const images: string[] = [];
  const resolveImage = (target: string) => {
    const found = vault.resolve(target, file);
    if (!found) throw new Error(`Image not found in vault: ${target} (in ${path.basename(file)})`);
    images.push(found);
    return found;
  };

  visit(tree, 'blockquote', (node: Blockquote) => {
    convertCallout(node);
  });

  visit(tree, 'image', (node: Image) => {
    if (!/^[a-z]+:/i.test(node.url)) node.url = target.imageSrc(resolveImage(node.url));
  });

  visit(tree, 'text', (node: Text, index, parent) => {
    if (!parent || index === undefined) return;
    const replacement = expandText(node.value, (embed, inner, mark) => {
      if (mark !== undefined) return target.highlight(mark);
      const [ref, alias] = splitAlias(inner);
      const resolved = vault.resolve(ref, file);
      const isImage = IMAGE_EXTENSIONS.has(path.extname(ref.replace(/[#|^].*$/, '')).toLowerCase());

      if (embed && isImage) {
        const src = target.imageSrc(resolveImage(ref));
        return { type: 'image', url: src, alt: alias && !/^\d+(x\d+)?$/.test(alias) ? alias : '' } satisfies Image;
      }
      const label = alias ?? ref.replace(/#\^?/, ' › ').replace(/^.*\//, '');
      const url = resolved ? target.linkFor(resolved) : undefined;
      return url
        ? ({ type: 'link', url, children: [{ type: 'text', value: label }] } satisfies Link)
        : { type: 'text', value: label };
    });
    parent.children.splice(index, 1, ...(replacement as never[]));
    return [SKIP, index + replacement.length];
  });

  // Obsidian shows single newlines as line breaks (strict line breaks off), so keep them.
  visit(tree, 'text', (node: Text, index, parent) => {
    if (!parent || index === undefined || !node.value.includes('\n')) return;
    const lines = node.value.replace(BLOCK_ID, '').split('\n');
    const parts: PhrasingContent[] = lines.flatMap((value, i) =>
      i === 0 ? [{ type: 'text', value }] : [{ type: 'break' }, { type: 'text', value }],
    );
    parent.children.splice(index, 1, ...(parts as never[]));
    return [SKIP, index + parts.length];
  });

  visit(tree, 'text', (node: Text) => {
    node.value = node.value.replace(BLOCK_ID, '');
  });

  const lede = tree.children.find((node): node is Paragraph => node.type === 'paragraph');
  const markdown = unified()
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      rule: '-',
      fences: true,
      handlers: target.lineBreak,
    })
    .stringify(tree);

  return { markdown, heading, lede: lede && plainText(lede).replace(/\s+/g, ' ').trim(), images };
}

/** `> [!note] Title` callouts become a blockquote that leads with the bold title. */
function convertCallout(node: Blockquote) {
  const paragraph = node.children[0];
  if (paragraph?.type !== 'paragraph') return;
  const text = paragraph.children[0];
  if (text?.type !== 'text') return;

  const [firstLine, ...rest] = text.value.split('\n');
  const match = firstLine.match(CALLOUT);
  if (!match) return;

  const title = match[2] || match[1][0].toUpperCase() + match[1].slice(1);
  const remainder = [rest.join('\n'), ...paragraph.children.slice(1)];
  const body: PhrasingContent[] = remainder.flatMap((part) =>
    typeof part === 'string' ? (part ? [{ type: 'text', value: part }] : []) : [part],
  );

  node.children.splice(0, 1, {
    type: 'paragraph',
    children: [{ type: 'strong', children: [{ type: 'text', value: title }] }],
  });
  if (body.length) node.children.splice(1, 0, { type: 'paragraph', children: body });
}

function expandText(
  value: string,
  replace: (embed: boolean, inner: string, mark?: string) => PhrasingContent,
): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let last = 0;
  for (const match of value.matchAll(OBSIDIAN_INLINE)) {
    if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) });
    out.push(replace(match[1] === '!', match[2] ?? '', match[3]));
    last = match.index + match[0].length;
  }
  if (last === 0) return [{ type: 'text', value }];
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function splitAlias(inner: string): [string, string | undefined] {
  const bar = inner.indexOf('|');
  return bar === -1 ? [inner.trim(), undefined] : [inner.slice(0, bar).trim(), inner.slice(bar + 1).trim()];
}

function plainText(node: Root | RootContent): string {
  if (node.type === 'html') return node.value.replace(/<[^>]+>/g, '');
  if ('value' in node && typeof node.value === 'string') return node.value;
  if (node.type === 'break') return ' ';
  return 'children' in node ? node.children.map((child) => plainText(child as RootContent)).join('') : '';
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
