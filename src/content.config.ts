import { file, glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const books = defineCollection({
  loader: glob({ base: 'src/content/books', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    rating: z.number(),
    summary: z.string(),
  }),
});

const thoughts = defineCollection({
  loader: glob({ base: 'src/content/thoughts', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    /* Flags unfinished thinking; checked in the Obsidian note. */
    complete: z.boolean().default(true),
  }),
});

/* Single entry (`resume`) from src/content/resume/resume.yaml, the source of truth for /work. */
/* `YYYY-MM` strings in YAML (keeps the editor's JSON schema happy), parsed to Dates. */
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
  .transform((value) => new Date(value));

const resume = defineCollection({
  loader: file('src/content/resume/resume.yaml'),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      location: z.string(),
      links: z.record(z.string(), z.url()),
      education: z.array(
        z.object({
          school: z.string(),
          degree: z.string(),
          location: z.string(),
          start: month,
          end: month,
        }),
      ),
      experience: z.array(
        z.object({
          company: z.object({ name: z.string(), url: z.url() }),
          title: z.string(),
          team: z.string(),
          location: z.string(),
          start: month,
          end: month.optional(),
          stack: z.array(z.string()),
          summary: z.string(),
          highlights: z.array(z.string()),
        }),
      ),
      projects: z.array(
        z.object({
          name: z.string(),
          kind: z.string(),
          status: z.string().optional(),
          /* Listed under "Recent work" on the home page. */
          featured: z.boolean().default(false),
          url: z.url(),
          image: image().optional(),
          start: month.optional(),
          stack: z.array(z.string()),
          description: z.string(),
        }),
      ),
      skills: z.array(z.object({ label: z.string(), items: z.array(z.string()) })),
      awards: z.array(z.object({ title: z.string(), date: month, description: z.string() })),
    }),
});

export const collections = {
  books,
  thoughts,
  resume,
};
