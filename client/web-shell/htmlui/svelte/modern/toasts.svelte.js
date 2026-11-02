// Toasts: news the game would have put in an OK box (Toast.svelte), shown at the top of the screen for a few seconds
// while the game carries on. One host in the HTML layer (#htmlui-host, game pixels), made when the first toast comes.
import { mount } from 'svelte';
import ToastHost from './ToastHost.svelte';

export const list = $state([]);
let host = null, n = 0;
export function toast(text, ms = 5000) {
  if (!host) {
    const at = document.getElementById('htmlui-host') || document.body;
    host = document.createElement('div');
    host.className = 'mu-toasts';
    at.append(host);
    mount(ToastHost, { target: host });
  }
  const id = ++n;
  list.push({ id, text });
  setTimeout(() => dismiss(id), ms);
  return id;
}
export function dismiss(id) {
  const i = list.findIndex(t => t.id === id);
  if (i >= 0) list.splice(i, 1);
}
