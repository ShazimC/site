import { getCollection, type CollectionEntry } from 'astro:content';

export type Thought = CollectionEntry<'thoughts'>;

const WORDS_PER_MINUTE = 230;

/** Published thoughts, newest first. Drafts only show in dev. */
export async function getThoughts(): Promise<Thought[]> {
  const thoughts = await getCollection('thoughts', ({ data }) => import.meta.env.DEV || !data.draft);
  return thoughts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function readingTime(body = ''): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Shared view-transition name linking a thought's list title to its post heading. */
export const thoughtTransition = (id: string) => `thought-${id}`;
