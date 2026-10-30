// The profile / mail / friends / teams windows (Game: CWindowModelProfile, SetComment, DMail, DMailSend, Friendlist,
// Blacklist, BlacklistInput, FriendEnum, Teamlist). The ones without a text field are all generic controls, drawn
// by the bridge with no screen module. The ones you type in are owned, as the chat is (screens/chat.js): a real
// <input> / <textarea> per field (IME, paste, selection, copy) committing through setText, <button>s over the
// buttons, selectable list text: the profile comment (SetComment), a mail (DMailSend), a name to block
// (BlacklistInput).
import chat from './chat.js';

export default { ...chat, classes: ['CWindowModelSetComment', 'CWindowModelDMailSend', 'CWindowModelBlacklistInput'] };
