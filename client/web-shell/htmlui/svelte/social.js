// The profile / mail / friends / teams windows in Svelte (supersedes screens/social.js once its flip pairs match:
// ?HTML_SVELTE=social): owned as the chat is (chat/Owned.svelte), drawn by screens/social.js's draw and background.
import { screen } from './screen.svelte.js';
import { CLASSES } from '../screens/social.js';
import Social from './chat/Social.svelte';

export default screen(Object.fromEntries(CLASSES.map(cls => [cls, Social])), { mode: 'owned' });
