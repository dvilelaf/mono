import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const canonical = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/canonical' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    order: z.number(),
    summary: z.string(),
    sourceFile: z.string(),
  }),
});

export const collections = { canonical };
