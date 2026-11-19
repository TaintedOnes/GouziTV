import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '预告片',
  description: '浏览预告片',
};

export default function TrailersPage() {
  return <BrowsePage section="trailer" />;
}
