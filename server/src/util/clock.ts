// Wall clock in py's formats (time.time(), time.strftime("%Y-%m-%d %H:%M:%S") in local time).
// Parity runs pin TZ=UTC on both servers.
const p2 = (n: number) => String(n).padStart(2, "0");

export class Clock {
  /** Fixed time for tests (seconds), or null = real time. */
  fixed: number | null = null;
  time(): number { return this.fixed ?? Date.now() / 1000; }
  strftime(t = this.time()): string {
    const d = new Date(t * 1000);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }
}
