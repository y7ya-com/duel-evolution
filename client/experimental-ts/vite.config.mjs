import { resolve } from 'node:path';
import { devAssetsPlugin, devOriginGate, localProxyOptions } from './tools/dev-assets.mjs';
import { createRemoteAssetMiddleware } from './tools/remote-assets.mjs';
import { createHtmlUiArtMiddleware, htmlUiModules, uiBase } from './tools/htmlui-art.mjs';
// All trust rewriting is confined to this loopback-only development server.
const upstream = process.env.DE_SERVER || 'http://127.0.0.1:8787';
const publicOrigin = process.env.DE_PUBLIC_ORIGIN || 'http://localhost:8787';
const port = Number(process.env.DE_CLIENT_PORT || 5174);
const proxy = () => localProxyOptions({ target:upstream,publicOrigin,port });
const assetPlugin = process.env.YO2_ASSET_URL ? {
  name:'duel-remote-assets',apply:'serve',configureServer(server) {
    server.middlewares.use(createRemoteAssetMiddleware({baseUrl:process.env.YO2_ASSET_URL,forwardValidators:true}));
    // main's Legacy HTML UI art (ui/ beside the game/ folder), for its screens (src/ui/htmlui)
    server.middlewares.use(createHtmlUiArtMiddleware({baseUrl:uiBase(process.env.YO2_ASSET_URL)}));
  },
} : devAssetsPlugin({gameRoot:process.env.YO2_GAME,cardsRoot:process.env.YO2_CARDS});
export default {
  plugins: [devOriginGate({ port }),assetPlugin,htmlUiModules(import.meta.dirname)],
  server: {
    host:'127.0.0.1',port,strictPort:true,
    proxy: {
      '/api':proxy(),
      '/net':{ ...proxy(),ws:true },
      '/__version':proxy(),
    },
    // main's Legacy HTML UI (its screens, controls and ui.js) is imported in place, so its commits flow in
    fs: { strict:true,allow:[resolve(import.meta.dirname),resolve(import.meta.dirname,'../web-shell/htmlui'),resolve(import.meta.dirname,'../html-ui/ui.js'),resolve(import.meta.dirname,'../web-shell/starter.js')] },
  },
  build: { target:'es2022',outDir:'dist',sourcemap:true },
};
