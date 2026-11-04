# Casual tag relay

Choose **Tag Duel** beside **Duel** in the lobby menu. You can also choose **Tag Duel** on a player's card to select that player as the opposing captain. The legacy interface has a Tag Duel button in the game viewport.

Pick your teammate, the opposing captain, and their teammate from players in your current location. The dialog previews both teams. Choose **Invite players**; the other players receive an in-game invitation with **Accept** and **Decline** buttons. The captain can cancel, and everyone can see who has accepted. The duel starts automatically after all four accept.

Invitations expire after two minutes. All four must be in the same location, use the same free/MMO mode and be available. Changing characters or mode invalidates an invitation. Players can have only one pending invitation at a time; hosts have a short cooldown between invitations.

Each team shares its captain's deck, field, hand and 8000 LP. Its captain plays the team's first turn, its partner the next, alternating thereafter. The current pilot also answers effects during the other team's turn. Both teammates see the shared hand. Only the current pilot receives decision prompts and can submit plays. Surrender or a disconnect concedes for the team. Server clocks and public spectating use the existing duel system.

The client shows both team rosters, brings the active name forward, and swaps the existing duel avatar to the pilot's equipped parts. Avatar updates require rebuilding the recomp client with `ovr/tagrelay.c` and the updated `ovr/duellog.c`. The invitation dialog is served through the HTML game UI. Existing clients without the rebuilt avatar hook can use the invitation dialog but do not display relay identity updates.

This mode is casual: no MP, card drops or ranked progress. It uses one shared deck per team, rather than independent decks/hands and native OCG tag swaps. It is a single game, without side decking. Four simultaneous 3D avatars are not implemented; the active avatar on each side changes with its pilot.
