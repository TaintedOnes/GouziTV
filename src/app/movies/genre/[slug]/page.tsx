import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BrowsePage } from '@/components/browse-page';
import { GENRES, genreBySlug } from '@/lib/genres';

export function generateStaticParams() {
  return GENRES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const genre = genreBySlug((await params).slug);
  if (!genre) return { title: '分类不存在' };
  return {
    title: `${genre.zh}电影`,
    description: `${genre.zh}电影（${genre.en}）：${genre.description}`,
  };
}

export default async function GenrePage({ params }: { params: Promise<{ slug: string }> }) {
  const genre = genreBySlug((await params).slug);
  if (!genre) notFound();
  return <BrowsePage section="movie" genre={genre.slug} />;
}
