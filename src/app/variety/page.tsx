import type { Metadata } from 'next';
import { BrowsePage } from '@/components/browse-page';

export const metadata: Metadata = {
  title: '综艺',
  description: '按类型、地区、年份浏览综艺',
};

export default function VarietyPage() {
  return <BrowsePage section="variety" />;
}
