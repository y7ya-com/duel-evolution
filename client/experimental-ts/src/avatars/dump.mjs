/** Parse the original SWF::Element text serialization without executing code. */
export function parseAvatarDump(text) {
  if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw new Error('Avatar dump exceeds budget');
  const split = text.indexOf('Header:');
  const start = text.indexOf('SWF::Element::Tag::', split);
  if (split < 0 || start < 0) throw new Error('Missing avatar dump header');
  const files = [...text.slice(0, split).matchAll(/png => ([^,\r\n]+),/g)].map(m => m[1].trim());
  if (!files.length || files.length > 256 || files.some(f => !/^[a-zA-Z0-9_?.-]+\.png$/.test(f))) throw new Error('Invalid avatar PNG table');
  const header = text.slice(split, start);
  const fps = Number(/Frame rate = ([\d.]+)/.exec(header)?.[1]);
  const count = Number(/Frame count = (\d+)/.exec(header)?.[1]);
  if (!(fps > 0 && fps <= 120 && count > 0 && count <= 4096)) throw new Error('Invalid avatar frame header');
  // Strings are protected before rewriting constructor syntax. JSON.parse is the only evaluator.
  const strings = [];
  let body = text.slice(start).replace(/"(?:[^"\\]|\\.)*"/g, s => { strings.push(s); return `__STR${strings.length - 1}__`; });
  body = body.replace(/#[^\r\n]*/g, '')
    .replace(/SWF::Element::(?:Array::)?[A-Za-z0-9_:]+->new\(\s*\[/g, '[')
    .replace(/SWF::Element::(?:Tag::)?([A-Za-z0-9_:]+)->new\(/g, '{"_t":"$1",')
    .replace(/\]\s*\)/g, ']').replace(/\)/g, '}')
    .replace(/(\w+)\s*=>\s*([^\s,{\[]+)/g, (_, k, v) => `${JSON.stringify(k)}:${/^-?\d+(\.\d+)?$/.test(v) ? v : JSON.stringify(v)}`)
    .replace(/(\w+)\s*=>\s*/g, '"$1":')
    .replace(/,(\s*[}\]])/g, '$1').replace(/}\s*{/g, '},{');
  body = body.replace(/"__STR(\d+)__"/g, (_, i) => strings[Number(i)]);
  const tags = JSON.parse(`[${body.trim()}]`);
  return { files, tags, fps, count };
}
