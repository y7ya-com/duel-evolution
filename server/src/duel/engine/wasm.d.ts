// wrangler's default CompiledWasm rule: a `.wasm` import is a precompiled WebAssembly.Module.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
