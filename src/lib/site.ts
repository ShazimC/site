/** Production origin: Astro's `site` (canonical URLs) and the base for cross-posted links. */
export const SITE_URL = 'https://shaz.im';

export const SITE_NAME = 'Shazim Chaudhary';

/** Fallback meta description for pages that don't pass their own. */
export const SITE_DESCRIPTION =
  'Shazim Chaudhary: design engineer at Xbox, student, and advocate. Projects, work, and writing on knowledge, beauty, and justice.';

export const SOCIALS = [
  { id: 'substack', label: 'Substack', href: 'https://signsreality.substack.com' },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/shazim-chaudhary-5b0418379/' },
  { id: 'medium', label: 'Medium', href: 'https://medium.com/@ShazimC' },
  { id: 'github', label: 'GitHub', href: 'https://github.com/ShazimC' },
] as const;
