import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { siteConfig } from '@/config/site';

export async function GET(context) {
  const psychology = await getCollection('psychology');
  const philosophy = await getCollection('philosophy');
  const reflections = await getCollection('reflections');

  const allPosts = [...psychology, ...philosophy, ...reflections];
  const sortedPosts = allPosts.sort((a, b) => new Date(b.data.pubDate).valueOf() - new Date(a.data.pubDate).valueOf());

  return rss({
    title: siteConfig.name,
    description: '우리는 종종 정답을 찾으려 밤을 헤매지만, 때로는 좋은 질문 하나를 남기는 것만으로도 충분한 밤이 있습니다.', //
    site: context.site,
    items: sortedPosts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/${post.collection}/${post.slug || post.id}/`,
    })),
  });
}