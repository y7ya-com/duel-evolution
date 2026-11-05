// Owner decisions are independent switches here. "economic" is the table the economics run chose (2026-11-05,
// de-scratch/shards/v3/PRICES.md): priced for the planned reward income; 1 UR craft = 3 UR dismantles = 1,500 Normals.
// Use positive safe integers; API, wallet, audit and persistence do not coerce shards to 32 bits.
export const SHARDS = {
  table: "economic" as "economic" | "proposed" | "stingy",
  craftedTradeable: true,
  // crafted copies can be dismantled again: a craft costs 3 dismantles, so craft -> dismantle always loses 2/3 (owner, 2026-11-05)
  craftedDismantlable: true,
  tradeRarityWeights: false,
  secretPacks: true,
  tables: {
    economic: { craft: { N: 5, R: 20, SR: 450, UR: 1500 }, dismantle: { N: 1, R: 2, SR: 150, UR: 500 } },
    proposed: { craft: { N: 15, R: 40, SR: 100, UR: 300 }, dismantle: { N: 1, R: 4, SR: 25, UR: 100 } },
    stingy: { craft: { N: 20, R: 50, SR: 150, UR: 450 }, dismantle: { N: 1, R: 2, SR: 15, UR: 150 } },
  },
};
export const shardValues = () => SHARDS.tables[SHARDS.table];
