import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '短剧',
  description: '按类型、地区、年份浏览短剧',
};

export default function ShortsPage() {
  return <BrowsePage section="short" />;
}
