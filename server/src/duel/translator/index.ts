// Duel translator (py research/traductor): ocgcore/duelcore events <-> the YO2 client. See translator.ts.
export { YO2Duel, Card, Side, norm, type Msg, type Cmd, type Deck, type YO2DuelOptions } from "./translator.ts";
export { CardMap, type TranslatorData } from "./cardmap.ts";
export { DEFAULT_CFG } from "./consts.ts";
export { mirror, mirror_state, unmirror_response, is_end } from "./mirror.ts";
export { comid_field, comid_field_raw, surrender_masks, timeup_warning } from "./lockstep.ts";
