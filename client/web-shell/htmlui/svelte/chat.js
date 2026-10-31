// The chat in Svelte (supersedes screens/chat.js once its flip pairs match: ?HTML_SVELTE=chat): the owned window as
// components (chat/Owned.svelte), the chat's controls drawn by screens/chat.js's drawControl (controls/skin.js CSS).
import { screen } from './screen.svelte.js';
import Chat from './chat/Chat.svelte';

export default screen({ CChatWindow: Chat }, { mode: 'owned' });
