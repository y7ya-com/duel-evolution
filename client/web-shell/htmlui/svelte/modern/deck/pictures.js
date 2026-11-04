// Keep the plain card-art loader shared with the non-Svelte shop and shippable
// under HTMLUI's root module allowlist. Vite externalizes this root import.
export { art, cached, picture } from '../../../card-pictures.js';
