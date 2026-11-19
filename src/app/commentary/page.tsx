import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '电影解说',
  description: '浏览电影解说',
};

export default function CommentaryPage() {
  return <BrowsePage section="commentary" />;
}
