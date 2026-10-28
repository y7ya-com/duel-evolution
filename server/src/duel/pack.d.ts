// wrangler Data rule (wrangler.jsonc "rules"): a `.pack` import is an ArrayBuffer.
declare module "*.pack" { const b: ArrayBuffer; export default b; }
