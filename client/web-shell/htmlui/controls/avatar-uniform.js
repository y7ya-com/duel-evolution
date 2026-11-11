// The engine makes a random Domino look for first dressing, ignoring the server's
// saved/default look. Select the real Slifer item so both the bust and the submitted
// avatar change. Repeat after a body change, which resets the engine's clothes.
export function starterUniform(win, api, st) {
  st.uniformWindow = win;
  if (!win.avatarCreation || win.avatarClothes === 0x80 || st.uniformBusy) return;
  const id = win.avatarCategory === 9
    ? win.avatarItems?.find(item => item.value === 0x80)?.id
    : win.avatarClothingButton;
  if (!id) return;
  st.uniformBusy = true;
  Promise.resolve(api.click(id)).finally(() => {
    st.uniformBusy = false;
    if (st.uniformWindow && st.uniformWindow !== win) starterUniform(st.uniformWindow, api, st);
  });
}

