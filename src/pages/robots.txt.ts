import type { APIRoute } from "astro";
import { siteConfig } from "@/config/site";

const robotsTxt = `
User-agent: *
Allow: /
Disallow: /studio
Disallow: /api/studio

Sitemap: ${new URL("sitemap-index.xml", siteConfig.url).href}
`.trim();

export const GET: APIRoute = () => {
  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
