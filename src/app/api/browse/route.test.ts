import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { SESSION_COOKIE, signSession } from '@/lib/auth';
import type { BrowseApiResponse } from '@/lib/browse';

/**
 * 片库浏览接口：分类表归类、按类型筛选、游标续扫、失败源不再重试、未知参数拒绝。
 * 上游一律 mock fetch（虚构的示例源），没有真实网络请求。
 */

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

const CLASSES = {
  class: [
    { type_id: 1, type_pid: 0, type_name: '电影' },
    { type_id: 6, type_pid: 1, type_name: '动作片' },
    { type_id: 9, type_pid: 1, type_name: '科幻片' },
    { type_id: 2, type_pid: 0, type_name: '电视剧' },
    { type_id: 21, type_pid: 1, type_name: '伦理片' },
  ],
};

function vod(id: number, typeId: number, extra: Record<string, unknown> = {}) {
  return { vod_id: id, vod_name: `示例${id}`, type_id: typeId, vod_year: '2024', vod_area: '美国', ...extra };
}

function mockUpstream() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      calls.push(url.host + url.search);
      if (url.host.startsWith('cms-down')) return new Response('bad gateway', { status: 502 });
      if (url.searchParams.get('ac') === 'list') return json(CLASSES);
      const t = url.searchParams.get('t');
      const pg = Number(url.searchParams.get('pg'));
      if (t === '21') return json({ list: [vod(21, 21, { type_name: '伦理片' })], pagecount: 1, total: 1 });
      if (t === '9') return json({ list: [vod(1, 9)], pagecount: 1, total: 1 });
      if (t === '1') {
        const pages = [
          [vod(10, 6, { vod_class: '动作,科幻' }), vod(11, 6, { vod_class: '动作' })],
          [vod(12, 6, { vod_class: '科幻' })],
        ];
        return json({ list: pages[pg - 1] ?? [], pagecount: pages.length, total: 3 });
      }
      return json({ list: [], pagecount: 0, total: 0 });
    })
  );
  return calls;
}

function req(body: unknown) {
  const { token } = signSession();
  return new Request('https://local.test/api/browse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

const OK_SOURCE = { key: 'a', name: '示例A', url: 'https://cms-demo-a.example.com/api.php/provide/vod' };
const DOWN_SOURCE = { key: 'b', name: '示例B', url: 'https://cms-down.example.com/api.php/provide/vod' };

beforeAll(() => {
  process.env.PASSWORD = 'test-password-123';
});
afterEach(() => vi.unstubAllGlobals());

describe('POST /api/browse', () => {
  it('skips adult sources and rejects an adult section', async () => {
    mockUpstream();
    const sources = [{ ...OK_SOURCE, isAdult: true }];
    expect((await POST(req({ sources, section: 'movie' }))).status).toBe(400);
    expect((await POST(req({ sources: [OK_SOURCE], section: 'adult' }))).status).toBe(400);
  });

  it('returns only films of the genre, from the genre category and from tags elsewhere', async () => {
    mockUpstream();
    const res = await POST(req({ sources: [OK_SOURCE], section: 'movie', genre: 'sci-fi' }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as BrowseApiResponse;
    expect(data.items.map((i) => i.vodId).sort()).toEqual(['1', '10', '12']);
    expect(data.done).toBe(true);
  });

  it('marks a failing source as done instead of retrying it forever', async () => {
    mockUpstream();
    const res = await POST(req({ sources: [OK_SOURCE, DOWN_SOURCE], section: 'movie' }));
    const data = (await res.json()) as BrowseApiResponse;
    const down = data.sources.find((s) => s.sourceKey === 'b')!;
    expect(down.ok).toBe(false);
    expect(down.error).toContain('502');
    expect(data.cursors.b).toBeNull();
    expect(data.items.every((i) => i.sourceKey === 'a')).toBe(true);
  });

  it('reports sources that have no such section', async () => {
    mockUpstream();
    const data = (await (await POST(req({ sources: [OK_SOURCE], section: 'variety' }))).json()) as BrowseApiResponse;
    expect(data.items).toEqual([]);
    expect(data.sources[0].unsupported).toBe(true);
    expect(data.done).toBe(true);
  });

  it('skips sources whose cursor is already finished', async () => {
    const calls = mockUpstream();
    const data = (await (
      await POST(req({ sources: [OK_SOURCE], section: 'movie', cursors: { a: null } }))
    ).json()) as BrowseApiResponse;
    expect(data.items).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('rejects unknown sections, genres and regions, and requests without sources', async () => {
    mockUpstream();
    expect((await POST(req({ sources: [OK_SOURCE], section: 'unknown' }))).status).toBe(400);
    expect((await POST(req({ sources: [OK_SOURCE], section: 'movie', genre: 'nope' }))).status).toBe(400);
    expect((await POST(req({ sources: [OK_SOURCE], section: 'movie', region: 'mars' }))).status).toBe(400);
    expect((await POST(req({ sources: [], section: 'movie' }))).status).toBe(400);
  });

  it('refuses private-network source addresses', async () => {
    mockUpstream();
    const data = (await (
      await POST(req({ sources: [{ key: 'x', name: 'x', url: 'http://127.0.0.1/api.php' }], section: 'movie' }))
    ).json()) as BrowseApiResponse;
    expect(data.sources[0].ok).toBe(false);
    expect(data.items).toEqual([]);
  });
});
