/** Squarified treemap (Bruls, Huizing, van Wijk). Returns rectangles in percentages of the container. */
export interface Rect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(row: number[], side: number): number {
  const s = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

export function squarify(items: { key: string; value: number }[], width = 100, height = 100): Rect[] {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (total <= 0) return [];
  const area = width * height;
  const nodes = [...items].sort((a, b) => b.value - a.value).map((i) => ({ key: i.key, a: (i.value / total) * area }));
  const out: Rect[] = [];
  let x = 0, y = 0, w = width, h = height;
  let row: typeof nodes = [];

  const layoutRow = () => {
    const sum = row.reduce((a, n) => a + n.a, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const n of row) {
        const ch = n.a / cw;
        out.push({ key: n.key, x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const n of row) {
        const cwid = n.a / rh;
        out.push({ key: n.key, x: cx, y, w: cwid, h: rh });
        cx += cwid;
      }
      y += rh;
      h -= rh;
    }
    row = [];
  };

  for (const n of nodes) {
    const side = Math.min(w, h);
    const candidate = [...row, n];
    if (row.length === 0 || worst(candidate.map((r) => r.a), side) <= worst(row.map((r) => r.a), side)) row = candidate;
    else {
      layoutRow();
      row = [n];
    }
  }
  if (row.length) layoutRow();
  return out.map((r) => ({ ...r, x: (r.x / width) * 100, y: (r.y / height) * 100, w: (r.w / width) * 100, h: (r.h / height) * 100 }));
}
