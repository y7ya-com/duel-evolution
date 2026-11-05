// Keep the owner's live rewards toggle independent of the baseline server suite.
// Rewards-specific tests explicitly enable it in their own setup.
import { REWARDS } from "../src/game/rewards-config.ts";
REWARDS.enabled = false;
