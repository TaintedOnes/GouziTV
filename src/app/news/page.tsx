import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '资讯花絮',
  description: '浏览资讯花絮',
};

export default function NewsPage() {
  return <BrowsePage section="news" />;
}
