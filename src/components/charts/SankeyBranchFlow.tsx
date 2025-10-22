'use client';

import dynamic from 'next/dynamic';
import type { SankeyCommonProps, SankeyDatum } from '@nivo/sankey';

type FlowResp = {
  nodes: string[];
  links: Array<{ source: string; target: string; opened: number; merged: number; closed: number }>;
};

const ResponsiveSankey = dynamic(() => import('@nivo/sankey').then(m => m.ResponsiveSankey), { ssr: false });

export default function SankeyBranchFlow({ data }: { data: FlowResp }) {
  // Map our structure to Nivo’s SankeyDTO
  const nodes: SankeyDatum[] = Array.from(
    new Set(data.links.flatMap(l => [l.source, l.target]))
  ).map(id => ({ id }));

  // Weight links by total, show merged share in tooltip
  const links = data.links.map(l => ({
    source: l.source,
    target: l.target,
    value: Math.max(1, l.opened + l.merged + l.closed),
    meta: l,
  }));

  const theme = {
    text: { fontSize: 11 },
    tooltip: { container: { fontSize: 12 } },
  };

  return (
    <div className="w-full h-[360px] rounded-lg border border-base-300 bg-base-100">
      <div className="h-full">
        <ResponsiveSankey
          data={{ nodes, links }}
          margin={{ top: 16, right: 12, bottom: 16, left: 12 }}
          nodeOpacity={0.95}
          nodeThickness={12}
          nodeSpacing={16}
          nodeBorderWidth={1}
          nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.6]] }}
          nodeStrokeColor={{ from: 'color', modifiers: [] }}
          nodeTooltip={({ node }) => (
            <div className="px-2 py-1 rounded bg-base-200 text-sm">
              <b className="font-mono">{node.id}</b>
            </div>
          )}
          linkOpacity={0.45}
          linkBlendMode="multiply"
          linkContract={2}
          linkTooltip={({ link }) => {
            const m = (link as any).meta as FlowResp['links'][number];
            return (
              <div className="px-2 py-1 rounded bg-base-200 text-sm">
                <div><b className="font-mono">{m.source}</b> → <b className="font-mono">{m.target}</b></div>
                <div className="opacity-80">opened: {m.opened} · merged: {m.merged} · closed: {m.closed}</div>
              </div>
            );
          }}
          colors={{ scheme: 'set2' }}
          theme={theme}
          label={(n) => String(n.id)}
          labelPosition="outside"
          labelPadding={10}
          labelOrientation="vertical"
        />
      </div>
      <div className="px-3 py-2 text-xs opacity-70 border-t border-base-300">
        Link thickness = total flow · hover to see opened / merged / closed
      </div>
    </div>
  );
}
