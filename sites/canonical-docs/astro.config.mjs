import { defineConfig } from 'astro/config';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  site: 'https://jinn.network',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  markdown: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: { className: ['heading-anchor'] },
        },
      ],
    ],
    shikiConfig: {
      // Dark-first; the design system is dark-first.
      theme: 'github-dark-default',
      wrap: true,
    },
  },
});
