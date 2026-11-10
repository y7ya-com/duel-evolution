// The September 2008 client text is the rules baseline. Keep this catalog shared with the client asset builder.
// Pre-errata counterparts come from ProjectIgnis CardScripts in scripts.pack; GetID() binds to the requested
// ORIGINAL passcode, so decks, aliases, effect descriptions and named-card interactions keep their real IDs.
import catalog from "./era2008.json";

export const ERA_2008 = catalog as Record<string, { name: string; packed?: boolean; source?: number; patch?: string; aliases?: number[] }>;

/** Fail closed if upstream changes: silently falling back to a modern effect would change the format. */
function replace(src: string, old: string, next: string, name: string): string {
  if (src.split(old).length !== 2) throw new Error(`2008 ${name}: script changed; review the legacy patch`);
  return src.replace(old, next);
}

export function patch2008(code: number, src: string): string {
  const card = ERA_2008[code];
  const edit = (old: string, next: string) => { src = replace(src, old, next, card.name); };
  switch (card.patch) {
    case "brain":
      edit(" and c:IsSummonableCard()", "");
      break;
    case "exchange":
      edit("\te1:SetCountLimit(1,id,EFFECT_COUNT_CODE_DUEL)\n", "");
      edit(" and Duel.GetFieldGroupCount(tp,0,LOCATION_GRAVE)>=15", "");
      break;
    case "order":
      edit("\te4:SetOperation(s.mtop)", "\te4:SetCondition(function(e,tp) return Duel.IsTurnPlayer(tp) end)\n\te4:SetOperation(s.mtop)");
      edit("if Duel.CheckLPCost(tp,700) then", "if Duel.CheckLPCost(tp,700) and Duel.SelectYesNo(tp,aux.Stringid(id,0)) then");
      break;
    case "darkness":
      edit("Duel.ChangePosition(tc,POS_FACEDOWN_DEFENSE)", "Duel.ChangePosition(tc,POS_FACEDOWN_ATTACK,POS_FACEDOWN_ATTACK,POS_FACEDOWN_DEFENSE,POS_FACEDOWN_DEFENSE)");
      edit("Duel.SetOperationInfo(0,CATEGORY_POSITION,g,1,tp,POS_FACEDOWN_DEFENSE)", "Duel.SetOperationInfo(0,CATEGORY_POSITION,g,1,tp,POS_FACEDOWN)");
      break;
    case "union": {
      // Old Unions allow only one Union per monster and unequip into Attack Position. Armored Cybern and Heavy
      // Mech protect against effect destruction too; the other three only replace battle destruction.
      const protect = code === 67159705 || code === 23265594 ? ",true,false" : ",true";
      const line = src.split("\n").find(l => l.includes("aux.AddUnionProcedure(c,"));
      if (!line) throw new Error(`2008 ${card.name}: missing Union procedure`);
      edit(line, line.slice(0, -1) + protect + ")");
      if (code !== 67159705) {
        const value = src.split("\n").find(l => /e1:SetValue\(\d+\)/.test(l));
        if (!value) throw new Error(`2008 ${card.name}: missing equip bonus`);
        edit(value, value + "\n\te1:SetCondition(aux.IsUnionState)");
      }
      break;
    }
    case "fusion": {
      // Send materials on activation, retain their group on e1, and summon on the SECOND own Standby Phase.
      const start = src.indexOf("\t--Turn 1\n"), end = src.indexOf("\t--Turn 2\n");
      if (start < 0 || end <= start) throw new Error("2008 Future Fusion: missing Standby effects");
      src = src.slice(0, start) + src.slice(end);
      edit("\te1:SetCost(s.reg)", "\te1:SetCategory(CATEGORY_TOGRAVE)\n\te1:SetCost(s.reg)\n\te1:SetTarget(s.starttg)\n\te1:SetOperation(s.tgop)");
      edit("\te3:SetLabelObject(e2)", "\te3:SetLabelObject(e1)");
      src += `\nfunction s.starttg(e,tp,eg,ep,ev,re,r,rp,chk)
  if chk==0 then
    local mg=Duel.GetMatchingGroup(s.filter1,tp,LOCATION_DECK,0,nil,e)
    return Duel.IsExistingMatchingCard(s.filter2,tp,LOCATION_EXTRA,0,1,nil,mg)
  end
  Duel.SetOperationInfo(0,CATEGORY_TOGRAVE,nil,1,tp,LOCATION_DECK)
end\n`;
      break;
    }
  }
  return src;
}
