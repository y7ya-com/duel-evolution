# Social integration API

Import `SocialController`, `SocialState`, `SocialAction` from `features/social` and
the trade's windows from `ui/htmlui/trade.ts` and its trunk from `ui/htmlui/trade-trunk.ts` (extensionless browser imports).

Construct `new SocialController({ send: command => session.send(command), onChange: state => render(state) })`.
Read `.state` for the initial render; construction sends nothing. Feed lobby messages
via `.receive({ id, data })`; pass UI actions to `.dispatch(action)`. Call `.reset()`
on logout/session replacement and `.dispose()` on teardown. Reset sends nothing;
disposed instances ignore all subsequent calls. State updates are immutable. `state.drafts` stores all form fields; the renderer dispatches
`editDraft {key,value}` on input and uses stable `data-key` attributes, so multi-field
drafts survive whole-stage rerenders. Reset clears all drafts. Drafts are bounded
to 32 fields, 512 characters per field.

Mount `renderSocialFeature(controller.state, action => controller.dispatch(action))`
in the social screen. The renderer owns only listeners on its returned subtree.
It uses inline confirmation buttons for mail send, team leave/disband and trade
ready/final confirmation/cancel. No document/window listeners.

Actions use a `type` discriminant: `refreshMail`, `sendMail {toPid,subject,body}`,
`findPlayer {name}`, `inviteFriend {pid}`, `replyFriend {pid,accept}`,
`ignore/unignore {pid}`, `refreshTeam`, `createTeam {name}`, `inviteTeam {pid}`,
`replyTeam {teamId,inviterPid,accept}`, `leaveTeam`, `disbandTeam`,
`inviteTrade {pid}`, `replyTrade {accept}`, `addTradeCard {passcode}`,
`removeTradeCard {index}`, `readyTrade`, `confirmTrade {accept}`, `cancelTrade`.

`state.status` describes requests/results, not guaranteed delivery. `error` contains
validation/decode/transport errors. `mail` is the latest bounded inbox (50),
`friendOffers` and `teamInvites` are bounded incoming invitations. `friends` and
`ignored` contain only server-confirmed changes observed this session, not a full
account roster (the binary protocol has no full roster). A friend acceptor receives
no success reply and therefore does not add a locally assumed friend.
`team`/`teamMembers` are authoritative listing data. Team notices trigger a refresh
because the controller intentionally has no assumed own player id.

`trade.phase`: idle/requesting/offered/waiting/open/closing/finished. `ownOffer`
updates only after server ARRIVE (the peer acknowledged a move), never the ambiguous
ADDCARD/DELETECARD result. One outgoing move at a time; `pendingMove` blocks ready.
`view` projects incoming moves/readiness/result/collection tables. Acceptance loads
collection and starts queued moves automatically. Cancel of an open trade has no
local server acknowledgement: it remains `closing` until reset, a peer notice or a new invitation request. Sending cancel only marks a local
closing intent; it does not assert that the server has closed the trade.
Inviting after a finished trade sends USEREXIT first because the server retains
its done session until USEREXIT. Invite is also available from closing; server
response determines whether the request succeeded. Server failure codes stay
visible. Lists and pending invitations are bounded; malformed packets never escape
receive. No automatic final trade confirmation.

Wire authority: server/src/game/lobby.ts, teams.ts, trade.ts; all commands and
payload decoders come from src/gameplay/{social,trade,messages}.
