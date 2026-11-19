import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '动漫',
  description: '按类型、地区、年份浏览动漫',
};

export default function AnimePage() {
  return <BrowsePage section="anime" />;
}
