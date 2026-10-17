/** Base path of the deployed site ("/chile-abierto" on GitHub Pages). next/link adds it automatically; plain <a> and fetch need it. */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const href = (p: string) => `${BASE}${p}`;
