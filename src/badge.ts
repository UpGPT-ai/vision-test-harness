/**
 * Badge generator — "Tested with Vision Test Harness" SVG badge.
 */

export interface BadgeOptions {
  status?: 'passing' | 'failing' | 'unknown';
  label?: string;
  color?: string;
}

export function generateBadgeSvg(options: BadgeOptions = {}): string {
  const label = options.label ?? 'vision tests';
  const status = options.status ?? 'passing';
  const color = options.color ?? (status === 'passing' ? '#34d399' : status === 'failing' ? '#f87171' : '#94a3b8');

  const labelWidth = label.length * 6.5 + 12;
  const statusWidth = status.length * 6.5 + 12;
  const totalWidth = labelWidth + statusWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <rect rx="3" width="${totalWidth}" height="20" fill="#555"/>
  <rect rx="3" x="${labelWidth}" width="${statusWidth}" height="20" fill="${color}"/>
  <rect rx="3" width="${totalWidth}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + statusWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${status}</text>
    <text x="${labelWidth + statusWidth / 2}" y="14">${status}</text>
  </g>
</svg>`;
}

export function generateMarkdownBadge(repoUrl?: string): string {
  const badgeUrl = 'https://img.shields.io/badge/tested%20with-Vision%20Test%20Harness-34d399?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0id2hpdGUiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTggMWE3IDcgMCAxMDAgMTRBNyA3IDAgMDA4IDFaTTUgOGwxLjUtMS41TDggOGwxLjUtMS41TDExIDhsLTMgMy0zLTN6Ii8+PC9zdmc+';
  const linkUrl = repoUrl ?? 'https://upgpt.ai/tools/test-harness';
  return `[![Vision Tests](${badgeUrl})](${linkUrl})`;
}
