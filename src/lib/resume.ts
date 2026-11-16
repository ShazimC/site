import { getEntry, type CollectionEntry } from 'astro:content';

export type Resume = CollectionEntry<'resume'>['data'];
export type Project = Resume['projects'][number];

export async function getResume() {
  const entry = await getEntry('resume', 'resume');
  if (!entry) throw new Error('Missing `resume` entry in src/content/resume/resume.yaml');
  return entry.data;
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatRange(start: Date, end?: Date): string {
  return `${formatMonth(start)} – ${end ? formatMonth(end) : 'Present'}`;
}

/** The project's write-up page, from its `post` reference. */
export const projectHref = (project: Project) => `/work/${project.post.id}/`;

/** Shared view-transition name linking a project's card or row title to its write-up heading. */
export const projectTransition = (id: string) => `project-${id}`;
