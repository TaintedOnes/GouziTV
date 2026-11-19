'use client';

import { Suspense } from 'react';
import { Header } from './header';
import { BrowseView } from './browse-view';
import type { SectionId } from '@/lib/genres';

/** 频道页 / 类型页外壳：顶栏 + 浏览视图（useSearchParams 需要 Suspense 边界） */
export function BrowsePage({ section, genre }: { section: SectionId; genre?: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />
      <Suspense>
        <BrowseView section={section} fixedGenre={genre} />
      </Suspense>
    </div>
  );
}
