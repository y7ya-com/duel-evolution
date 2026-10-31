<script module>
  // Modern UI's icons: authored 20 x 20 strokes (theme.js .mu-ico: 1.8 px, round), one set for every screen
  export const PATHS = {
    close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
    menu: 'M3.5 6h13M3.5 10h13M3.5 14h13',
    chevron: 'M7.5 4.5L13 10l-5.5 5.5',
    back: 'M12.5 4.5L7 10l5.5 5.5',
    plus: 'M10 4v12M4 10h12',
    trash: 'M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6M8.7 8.8v4.4M11.3 8.8v4.4',
    deck: 'M6 3.5h8.5v12H6zM3.5 6v11.5H12',
    profile: 'M10 10.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM4 17c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6',
    title: 'M10 3l2 4.2 4.5.6-3.3 3.1.8 4.5L10 13.2l-4 2.2.8-4.5L3.5 7.8 8 7.2z',
    comment: 'M4 4.5h12v8.5H9l-3.5 3v-3H4z',
    duel: 'M10 2.8l6 3.4v7.6l-6 3.4-6-3.4V6.2zM10 2.8v14.4M4 6.2l12 7.6M16 6.2L4 13.8',
    mail: 'M3.5 5.5h13v9h-13zM3.5 6l6.5 5 6.5-5',
    audio: 'M4 8h3l4-3.5v11L7 12H4zM14 7.5a3.5 3.5 0 0 1 0 5M15.8 5.5a6.3 6.3 0 0 1 0 9',
    log: 'M5 3.5h10v13H5zM7.5 7h5M7.5 10h5M7.5 13h3',
    ignore: 'M10 16.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.4 5.4l9.2 9.2',
    friends: 'M7.5 9.5a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM2.8 16c.6-2.6 2.5-4 4.7-4s4.1 1.4 4.7 4M13.2 9.3a2.4 2.4 0 1 0-.9-4.6M14.4 11.8c1.5.4 2.6 1.7 3 4',
    team: 'M10 3l6 2.5v4.3c0 3.6-2.6 6-6 7.2-3.4-1.2-6-3.6-6-7.2V5.5z',
    exit: 'M8 4H4.5v12H8M11.5 6.5L15 10l-3.5 3.5M15 10H8',
    pin: 'M10 17s5-4.6 5-8.6A5 5 0 0 0 5 8.4C5 12.4 10 17 10 17zM10 10.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z',
    people: 'M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 15.5c.5-2.4 2-3.6 4-3.6s3.5 1.2 4 3.6M13.5 9a2.2 2.2 0 1 0 0-4.4M14.5 12c1.3.3 2.2 1.4 2.5 3.5',
    sparkle: 'M10 3v4M10 13v4M3 10h4M13 10h4M5.6 5.6l2 2M12.4 12.4l2 2M14.4 5.6l-2 2M7.6 12.4l-2 2',
    search: 'M8.8 14.6a5.8 5.8 0 1 0 0-11.6 5.8 5.8 0 0 0 0 11.6zM13 13l3.8 3.8',
    send: 'M3.5 10l13-6-4.5 13-2.5-5.5z',
    dot: 'M10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  };
</script>

<script>
  let { name, size = 18, class: cls = '' } = $props();
</script>

<svg class="mu-ico {cls}" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true"><path d={PATHS[name] || PATHS.dot} /></svg>
