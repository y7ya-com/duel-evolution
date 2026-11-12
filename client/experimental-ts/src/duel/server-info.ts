/** The duel server's 0x649b information box (CNetDuel::onSvrInfo): code 1 the connection was cut, 2 a surrender,
 * 3 time up, 4 refused; the flag is 1 when it is about the opponent. Original wording (StringDB 0x11a7 "%s has
 * disconnected." as live shows it with the duelist's name, 0x11a5, 0x11a2, 0x1972); null where the duel's own messages
 * already say it. */
export function serverInfoText(code: number, aboutOpponent: boolean, opponent: string): string | null {
  if (code === 1) return aboutOpponent ? `${opponent} has disconnected.` : 'You have been disconnected from the Duel Server.';
  if (code === 3) return aboutOpponent ? `${opponent} has ran out of time.` : 'Time is up!';
  return null;
}
