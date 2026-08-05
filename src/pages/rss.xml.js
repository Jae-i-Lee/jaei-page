import rss from "@astrojs/rss";
import { listPublishedPosts } from "@/lib/blog";
import { siteConfig } from "@/config/site";

export async function GET(context) {
  const sortedPosts = await listPublishedPosts();

  return rss({
    title: siteConfig.name,
    description:
      "우리는 종종 정답을 찾으려 밤을 헤매지만, 때로는 좋은 질문 하나를 남기는 것만으로도 충분한 밤이 있습니다.", //
    site: context.site,
    items: sortedPosts.map((post) => ({
      title: post.title,
      pubDate: post.pubDate,
      description: post.description,
      link: `/${post.category}/${post.slug}/`,
    })),
  });
}
