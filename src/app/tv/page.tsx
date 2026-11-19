import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '电视剧',
  description: '按类型、地区、年份浏览电视剧',
};

export default function TvPage() {
  return <BrowsePage section="tv" />;
}
