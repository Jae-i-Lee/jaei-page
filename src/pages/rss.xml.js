import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { siteConfig } from "@/config/site";

export async function GET(context) {
  const blog = await getCollection("philosophy");

  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    site: context.site,
    items: philosophy
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.description,
        link: `/philosophy/${post.id}/`,
        content: post.body, // Optional: include full content
        customData: post.data.author
          ? `<author>${post.data.author}</author>`
          : undefined,
      })),
    customData: `<language>${siteConfig.locale}</language>`,
  });
}

export async function GET(context) {
  const blog = await getCollection("psychology");

  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    site: context.site,
    items: psychology
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.description,
        link: `/psychology/${post.id}/`,
        content: post.body, // Optional: include full content
        customData: post.data.author
          ? `<author>${post.data.author}</author>`
          : undefined,
      })),
    customData: `<language>${siteConfig.locale}</language>`,
  });
}

export async function GET(context) {
  const blog = await getCollection("reflections");

  return rss({
    title: siteConfig.name,
    description: siteConfig.description,
    site: context.site,
    items: reflections
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
      .map((post) => ({
        title: post.data.title,
        pubDate: post.data.pubDate,
        description: post.data.description,
        link: `/reflections/${post.id}/`,
        content: post.body, // Optional: include full content
        customData: post.data.author
          ? `<author>${post.data.author}</author>`
          : undefined,
      })),
    customData: `<language>${siteConfig.locale}</language>`,
  });
}