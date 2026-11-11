import VT from './vtables.js';
const PRIMARY = Object.entries(VT).filter(([, [, offset]]) => !offset).map(([a, [c]]) => [+a, c]);

// CWindowTaskModel descendants from client/include/yo2/**/*.h (class declarations, transitive public bases).
// The generic renderer owns these too; screen modules additionally claim non-window tasks.
export const WINDOWS = new Set([
  'CCardDetailViewDlg', 'CChatWindow', 'CDeckCardLoader', 'CDuelDiskList',
  'CFindMenu', 'CFixedsentenceList', 'CHelpDialog', 'CMainMenu',
  'CNpcListMenu', 'COptionDlg', 'CPlayerListDlg', 'CPlayerListMenu',
  'CShopNpcProfile', 'CUDialogBaseOk', 'CUDiceDialog', 'CUDiscardDialog',
  'CUGDialogBase', 'CUGDialogBaseHP', 'CUGHelpManager', 'CULockOnDialog',
  'CUOkDialog', 'CUPhaseSelectDialog', 'CUPhaseYesNoDialog', 'CURitualDialog',
  'CUSelectAttributeDialog', 'CUSelectCoinDialog', 'CUSelectDialog', 'CUSelectNumDialog',
  'CUSelectStandDialog', 'CUSelectTypeDialog', 'CUSummonDialogSp', 'CUYesNoDialog',
  'CWindowDeckList', 'CWindowDialogAvatarSwitch', 'CWindowLogin', 'CWindowModelAboutEvent',
  'CWindowModelBalloon', 'CWindowModelBlacklist', 'CWindowModelBlacklistInput', 'CWindowModelCardDetail',
  'CWindowModelChatWindow', 'CWindowModelDMail', 'CWindowModelDMailSend', 'CWindowModelDeck',
  'CWindowModelDialogDecorator', 'CWindowModelDialogError', 'CWindowModelDialogOk', 'CWindowModelDialogWithBtns',
  'CWindowModelDialogYesNo', 'CWindowModelDuel', 'CWindowModelDuelConfig', 'CWindowModelDuelFind',
  'CWindowModelDuelWait', 'CWindowModelDueldiskRearrenge', 'CWindowModelDuellogList', 'CWindowModelDuellogOperation',
  'CWindowModelDuellogSearch', 'CWindowModelDuellogTop', 'CWindowModelDuellogTour', 'CWindowModelDuelpass150',
  'CWindowModelDuelpassInputCode', 'CWindowModelDuelpassUSB', 'CWindowModelFileList', 'CWindowModelFriendBlacklist',
  'CWindowModelFriendEnum', 'CWindowModelFriendlist', 'CWindowModelGoEvent', 'CWindowModelHelp',
  'CWindowModelInformation', 'CWindowModelInput1', 'CWindowModelInput2', 'CWindowModelInputValue',
  'CWindowModelItemGet', 'CWindowModelJoinGunsling', 'CWindowModelKaban', 'CWindowModelList',
  'CWindowModelListCard', 'CWindowModelListCardAttr', 'CWindowModelListCardForbi', 'CWindowModelListCardIcon',
  'CWindowModelListCardPack', 'CWindowModelListCardStar', 'CWindowModelListCardType', 'CWindowModelListDuelCmd',
  'CWindowModelMenu', 'CWindowModelMove', 'CWindowModelPictureButton', 'CWindowModelPlace',
  'CWindowModelPresent', 'CWindowModelProfile', 'CWindowModelProgress', 'CWindowModelReturnButton',
  'CWindowModelSetComment', 'CWindowModelTeamlist', 'CWindowModelThin', 'CWindowModelThinImg',
  'CWindowModelTitleConfig', 'CWindowModelTp', 'CWindowModelTrade', 'CWindowOptionDlg',
  'CWindowPackSelect', 'CWindowPlayerSelect', 'CWindowResult', 'CWindowResultNext',
  'CWindowResultNpc', 'CWindowTaskCardArea', 'CWindowTaskModel', 'ParamWindow',
]);

// Optional runtime extension { count, primary-vtables[slots] }; no pointer means an older runtime, no writes.
export function writeClasses(H, address, slots, owns, ready, vt = PRIMARY) {
  if (!address) return;
  const t = address >>> 2, ids = ready ? vt.filter(([, c]) => owns(c)).map(([a]) => a).slice(0, slots) : [];
  ids.forEach((a, i) => { H[t + 1 + i] = a; });
  H[t] = ids.length;
}
