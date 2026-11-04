# Account feature integration

Exports from `features/account`:
- `AccountController({ http: HttpClient, onChange: (state: AccountState) => void })`, `.state`, `dispatch(action: AccountAction): Promise<void>`, `reset(): void`, `dispose(): void`.
- `AccountPanel = 'overview' | 'register' | 'verify' | 'reset' | 'password' | 'claim'`.
- Actions: `{type:'show',panel}`, `{type:'refreshSession'}`, `{type:'register',username,password}`, `{type:'continueVerification',username,password}`, `{type:'resetPassword',code,newPassword}`, `{type:'setPassword',newPassword,username?}`, `{type:'claimLegacy',code}`, `{type:'linkDiscord'}`, `{type:'recoverDiscordResult',online:'1'|'0'}`.
- State: `panel`, `busy`, `status`, `error: string|null`, `errorCode: string|null`, `session: Session|null` (services/api Session), `verification: {username,code,inviteUrl,expiresInMinutes}|null`, `inviteUrl: string|null`, `redirectUrl: string|null`, `claimedAccount: string|null`.

`renderAccountFeature(state, dispatch): HTMLElement` from `ui/extra/account` accepts `(action:AccountAction)=>void|Promise<void>`. Parent UI adds `accountDetail?: AccountState` and `{type:'accountAction',action:AccountAction}` to its contracts and renders this on title/account surfaces. Parent owns app/main and UI contracts/index. No changes to those files here.

Call `refreshSession` on opening/account login changes. Parent may adopt a signed-in `state.session` after Continue/reset/Discord recovery; this feature does not connect gameplay. Reset on sign-out; dispose on teardown. Shared HttpClient remains owned by parent. Errors settle into state. `show` cancels prior work; busy blocks duplicate submissions. No mutation retry. Refresh after a mutation is GET only; if it fails, status explicitly says the mutation succeeded and session refresh failed.

Actual routes: POST `/api/de/register`; POST `/api/de/reset` (there are NO `/reset/start` or `/reset/finish` routes); POST `/api/de/password`; POST `/api/de/claim`; GET `/api/de/discord-invite`; GET `/api/de/session`; POST `/api/auth/sign-in/username`; POST `/api/auth/link-social` (explicitly enabled in auth.ts). Reset begins with `/reset` in Discord, not an HTTP mutation. Verification runs `/verify CODE` in Discord; Continue requires password re-entry because passwords are never retained. Re-register same name/password explicitly recovers a lost verification code.

For Discord sign-in parent can navigate to `/api/auth/sign-in/discord?return=/`. On callback parse `online=1|0`, remove callback query via parent router/history, dispatch `recoverDiscordResult`. No raw query error is retained. Link action returns a validated HTTPS Discord authorization URL in `redirectUrl`; parent must navigate to it (renderer also offers an explicit Continue link). Callback URLs use `/?online=1` and `/?online=0` to match existing flow. No automatic navigation in renderer/controller.

Secrets are only in submitted action/request lifetime, never state, storage, logs or drafts. Renderer clears password/reset-code/claim-code inputs synchronously before dispatch. Verification code is intentionally displayed in state until panel changes/reset/dispose. No subscriptions/global listeners/timers in renderer. Parent must never persist/serialize action payloads or restore password fields during rerender.

Secret inputs deliberately have no `data-key`, excluding both passwords and reset/claim codes from parent UI draft/focus snapshots. Only account-name fields use stable `data-key` values. Navigation links stay in the same tab; the feature does not open browser windows. Rendering is inert.

Validation: 32 focused Vitest checks in `tests/features-account.test.ts` and `tests/features-account-ui.test.ts`. Shared typecheck at 07:53 UTC found only the parent-owned app.ts exhaustive command switch missing accountAction/capture handling during integration; the account implementation and renderer produced no TypeScript diagnostics.
