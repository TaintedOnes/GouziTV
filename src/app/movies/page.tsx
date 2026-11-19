import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '电影',
  description: '按类型、地区、年份浏览电影',
};

export default function MoviesPage() {
  return <BrowsePage section="movie" />;
}
