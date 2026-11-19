import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '体育',
  description: '浏览体育',
};

export default function SportsPage() {
  return <BrowsePage section="sports" />;
}
