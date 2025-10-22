'use client';

import dynamic from 'next/dynamic';
const ResponsiveHeatMap = dynamic(() => import('@nivo/heatmap').then(m => m.ResponsiveHeatMap), { ssr: false });

type ReviewsResp = {
  authors: string[];
  reviewers: string[];
  matrix: Array<{ author: string; reviewer: string; count: number }>;
};

export default function ReviewHeatmap({ data }: { data: ReviewsResp }) {
  // Nivo wants rows of { id, data: [{x, y}] }
  const grouped = new Map<string, Map<string, number>>();
  for (const a of data.authors) grouped.set(a, new Map());
  for (const cell of data.matrix) {
    if (!grouped.has(cell.author)) grouped.set(cell.author, new Map());
    grouped.get(cell.author)!.set(cell.reviewer, cell.count);
  }

  const rows = Array.from(grouped.entries()).map(([author, map]) => ({
    id: author,
    data: data.reviewers.map(r => ({ x: r, y: map.get(r) ?? 0 })),
  }));

  return (
    <div className="w-full h-[360px] rounded-lg border border-base-300 bg-base-100">
      <div className="h-full">
        <ResponsiveHeatMap
          data={rows}
          keys={data.reviewers}
          indexBy="id"
          margin={{ top: 24, right: 12, bottom: 24, left: 120 }}
          forceSquare={true}
          padding={2}
          enableLabels={false}
          colors={{
            type: 'sequential',
            scheme: 'greens',   // looks great in dark and light
          }}
          axisTop={{
            tickRotation: -45,
            tickSize: 3,
            tickPadding: 6,
          }}
          axisLeft={{
            tickSize: 3,
            tickPadding: 6,
          }}
          theme={{ text: { fontSize: 11 } }}
          tooltip={({ xKey, yKey, value }) => (
            <div className="px-2 py-1 rounded bg-base-200 text-sm">
              {String(yKey)} reviewed by <b>{String(xKey)}</b>: {value}
            </div>
          )}
          legends={[
            {
              anchor: 'bottom',
              translateY: 18,
              length: 180,
              thickness: 8,
              direction: 'row',
              tickSize: 0,
              title: 'more reviews →',
              titleAlign: 'start',
              titleOffset: 8,
            },
          ]}
        />
      </div>
    </div>
  );
}
