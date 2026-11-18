/** Yugi's private draw skill. The engine owns every materialisation, so commands and
 * archives replay it exactly. It adds no chain, hint or extra draw event. */
export interface HeartCopyState { used: Map<number, number>; aliases: Map<number, number> }
/** A blank Spell with no effects (no real passcode is this large). A drawn card becomes it before the chosen card:
 * the engine keeps a card's old effects when the new card is a Normal Monster, so a materialised Summoned Skull still
 * resolved as the Giant Trunade it replaced. */
export const YUGI_HEART_BLANK = 0x59475550;
const luaTable = (entries: ReadonlyMap<number, number>) => `{${[...entries].map(([k, v]) => `[${k}]=${v}`).join(",")}}`;
export function yugiHeartLua(player: 0 | 1, pool: readonly number[], copies?: HeartCopyState): string {
  return `
local yugi=${player}
c${YUGI_HEART_BLANK}={initial_effect=function(c) end}
local pool={${pool.join(",")}}
local allowed={}
for _,code in ipairs(pool) do allowed[code]=true end
local capped=${copies ? "true" : "false"}
local used=${copies ? luaTable(copies.used) : "{}"}
local aliases=${copies ? luaTable(copies.aliases) : "{}"}
local function identity(code) return aliases[code] or code end
local function available(code,current)
  return not capped or identity(code)==current or (used[identity(code)] or 0)<3
end
local opcodes={TYPE_MONSTER+TYPE_SPELL+TYPE_TRAP,OPCODE_ISTYPE,0x59475549,OPCODE_NOT,OPCODE_NOT,OPCODE_AND}
local known={}
local busy=false
local sort=Duel.SortDecktop
local draw=Duel.Draw
local shuffle=Duel.ShuffleDeck
local confirmtop=Duel.ConfirmDecktop
local confirm=Duel.ConfirmCards
local send=Duel.SendtoDeck
local function remember(g)
  for c in aux.Next(g) do
    if c:IsControler(yugi) and c:IsLocation(LOCATION_DECK) then known[c:GetFieldID()]=true end
  end
end
local function exposed()
  if Duel.IsPlayerAffectedByEffect(yugi,EFFECT_REVERSE_DECK) then return true end
  local c=Duel.GetDecktopGroup(yugi,1):GetFirst()
  return c and (c:IsPublic() or c:IsFaceup() or known[c:GetFieldID()])
end
local function prepare(n)
  if busy or n<1 or exposed() then return end
  local g=Duel.GetDecktopGroup(yugi,n)
  if #g<n then return end
  local cards={}
  for c in aux.Next(g) do
    if c:IsPublic() or c:IsFaceup() or known[c:GetFieldID()] then return end
    cards[#cards+1]=c
  end
  table.sort(cards,function(a,b) return a:GetSequence()>b:GetSequence() end)
  busy=true
  for _,c in ipairs(cards) do
    local current=identity(c:GetOriginalCode())
    local haschoice=false
    for _,code in ipairs(pool) do if available(code,current) then haschoice=true break end end
    if haschoice then
      local filter={table.unpack(opcodes)}
      if capped then
        -- Private metadata identifies an existing copy that needs no new allowance.
        -- Keep the original filter unchanged when replaying unlimited-skill archives.
        for _,op in ipairs({current,OPCODE_NOT,OPCODE_NOT,OPCODE_AND}) do filter[#filter+1]=op end
      end
      local code
      repeat code=Duel.AnnounceCard(yugi,table.unpack(filter)) until allowed[code] and available(code,current)
      if capped and identity(code)~=current then used[identity(code)]=(used[identity(code)] or 0)+1 end
      -- Reuse the hidden card's slot and install the new card's real effects. The blank first clears the old card's
      -- effects: replacing them is skipped when the new card is a Normal Monster.
      c:Recreate(${YUGI_HEART_BLANK},nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true)
      c:Recreate(code,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true)
    end
  end
  busy=false
end
Duel.Draw=function(p,n,r)
  if p==yugi and n>0 then prepare(n) end
  return draw(p,n,r)
end
Duel.ShuffleDeck=function(p)
  local result=shuffle(p)
  if p==yugi then known={} end
  return result
end
Duel.ConfirmDecktop=function(p,n)
  if p==yugi then remember(Duel.GetDecktopGroup(p,n)) end
  return confirmtop(p,n)
end
Duel.ConfirmCards=function(p,g)
  if p~=yugi then remember(g) end
  return confirm(p,g)
end
Duel.SortDecktop=function(p,owner,n)
  local result=sort(p,owner,n)
  if owner==yugi and p~=yugi then remember(Duel.GetDecktopGroup(owner,n)) end
  return result
end
Duel.SendtoDeck=function(g,p,seq,reason)
  local public={}
  if seq==SEQ_DECKTOP then
    local group=g.GetFirst and g or Group.FromCards(g)
    for c in aux.Next(group) do if c:IsPublic() or c:IsLocation(LOCATION_GRAVE) then public[#public+1]=c end end
  end
  local result=send(g,p,seq,reason)
  if seq==SEQ_DECKSHUFFLE and (p==yugi or p==PLAYER_ALL or p==nil) then known={} end
  for _,c in ipairs(public) do if c:IsControler(yugi) and c:IsLocation(LOCATION_DECK) then known[c:GetFieldID()]=true end end
  return result
end
local e=Effect.GlobalEffect()
e:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
e:SetCode(EVENT_PREDRAW)
e:SetCondition(function() return Duel.GetTurnPlayer()==yugi end)
e:SetOperation(function() prepare(Duel.GetDrawCount(yugi)) end)
Duel.RegisterEffect(e,yugi)
`;
}
