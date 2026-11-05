export function badgeSvg(score) {
  const label = 'freshness';
  const value = score == null ? 'unknown' : `${score}/100`;
  const color = score == null ? '#9f9f9f' : score >= 70 ? '#2e9e5b' : score >= 40 ? '#d39b1f' : '#d1453b';
  const lw = 70;
  const vw = 14 + value.length * 7;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}">
<rect width="${lw}" height="20" fill="#1f3038"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14">LumaSuri</text><text x="${lw + vw / 2}" y="14">${value}</text></g></svg>`;
}
