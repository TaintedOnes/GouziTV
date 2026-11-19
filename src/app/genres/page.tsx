import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import { GENRES, GENRE_GROUPS, SECTIONS } from '@/lib/genres';

export const metadata: Metadata = {
  title: '分类',
  description: '按频道和电影类型浏览片库',
};

/** 分类总览：频道 + 全部电影类型。大块瓷砖，遥控器上下左右即可逐个选中 */
export default function GenresPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header showSearch />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 pb-24 sm:pb-8 space-y-7">
        <section>
          <h1 className="text-xl font-bold text-content mb-3">分类</h1>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5" data-autofocus>
            {SECTIONS.filter((s) => !s.special).map((s) => (
              <Link key={s.id} href={s.path} className="genre-tile genre-tile-lg">
                {s.name}
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">更多内容</h2>
          <p className="text-xs text-faint -mt-1.5 mb-2.5">预告片、解说、体育等不是正片，单独放在这里，不会混进电影和电视剧</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {SECTIONS.filter((s) => s.special).map((s) => (
              <Link key={s.id} href={s.path} className="genre-tile">
                <span className="text-content font-medium">{s.name}</span>
              </Link>
            ))}
          </div>
        </section>
        {GENRE_GROUPS.map((group) => (
          <section key={group.id}>
            <h2 className="text-base font-semibold text-content mb-2.5">{group.name}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {GENRES.filter((g) => g.group === group.id).map((g) => (
                <Link key={g.slug} href={`/movies/genre/${g.slug}`} className="genre-tile">
                  <span className="text-content font-medium">{g.zh}</span>
                  <span className="text-[11px] text-faint">{g.en}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
