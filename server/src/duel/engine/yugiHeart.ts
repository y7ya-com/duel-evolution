/** Yugi's private draw skill. The engine owns every materialisation, so commands and
 * archives replay it exactly. It adds no chain, hint or extra draw event. */
export function yugiHeartLua(player: 0 | 1, pool: readonly number[]): string {
  return `
local yugi=${player}
local pool={${pool.join(",")}}
local allowed={}
for _,code in ipairs(pool) do allowed[code]=true end
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
    local code
    repeat code=Duel.AnnounceCard(yugi,table.unpack(opcodes)) until allowed[code]
    -- Reuse the hidden card's identity/slot for the legacy client. The final
    -- argument installs the new card's real effects (after the link-marker slot).
    c:Recreate(code,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,true)
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
