# Local experimental client

Run the existing Worker locally first (setup is in the repository root README):

```sh
cd server
pnpm dev
```

In a second terminal:

```sh
cd client/experimental-ts
node tools/catalog.mjs
YO2_GAME=/path/to/your/game DE_PUBLIC_ORIGIN=http://localhost:8787 npm run dev
```

Open **http://localhost:5174/?assets=/game-assets/**. Sign in with an existing local account. The generated card
catalog is private game-derived display metadata; keep it untracked. Missing artwork does not prevent networking.
Use `YO2_CARDS=/path/to/card-art-root` optionally for its `merge/data/card.dat` and `merge/data/mini.dat`; otherwise
these archives are sought under `YO2_GAME`. The original `merge.dat` remains the card-art fallback when catalog
metadata gives its entry path. No game archives or extracted images are copied into the project.

- `DE_SERVER` defaults to `http://127.0.0.1:8787`: the local upstream Worker.
- `DE_PUBLIC_ORIGIN` defaults to `http://localhost:8787`: **match the Worker's `PUBLIC_ORIGIN` exactly**.
- Vite binds only `127.0.0.1:5174` and requires that port (`strictPort`). Use `localhost` in the browser so the
  existing localhost authentication cookie behavior applies. Secure/httpOnly/SameSite cookie attributes stay intact.
- `/api`, `/net` and `/__version` proxy to the Worker. Accepted local browser Origins on port 5174 are rewritten
  to `DE_PUBLIC_ORIGIN` for HTTP and WebSocket requests. Foreign/missing mutation and game-WS Origins are refused;
  server authentication and account binding remain active. Both proxy configuration origins must be loopback.
- This proxy rewrite and local-asset middleware run only in Vite development mode, not a production build.

`/game-assets/` exposes only `merge.dat`, `Sound.dat`, `merge/data/card.dat` and `merge/data/mini.dat`. GET requires a
single valid `Range` of at most 32 MiB; HEAD can inspect metadata. Reads stream in 64 KiB chunks. Invalid ranges
return 416; an archive changed since `If-Range` returns 412 so the client reloads rather than downloading a complete
archive. Path traversal, symlink files/directories, arbitrary files, directory listings and writes are rejected.
Archive errors never disclose local filesystem paths.

```sh
npm run typecheck
npm test -- tests/tooling-dev-assets.test.ts
npm run build
```

These checks use synthetic archives and ephemeral loopback HTTP servers, not the original game client. A real game
archive can be verified by opening a scene with the `assets` query parameter after configuring your own files.
