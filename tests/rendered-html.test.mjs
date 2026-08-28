import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the complete solitaire and cloud controls", async () => {
  const html = await readFile(new URL("../public/game/index.html", import.meta.url), "utf8");
  assert.match(html, /id="tableau"/);
  assert.match(html, /id="dailyCalendarModal"/);
  assert.match(html, /id="leaderboardBtn"/);
  assert.match(html, /id="cloudAccountBtn"/);
  assert.match(html, /miyeon-spider-win/);
  assert.match(html, /spider-cloud\.js/);
});

test("ships all 52 Miyeon card portraits", async () => {
  const suits = ["hearts", "spades", "diamonds", "clubs"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  await Promise.all(suits.flatMap((suit) => ranks.map(async (rank) => {
    const png = new URL(`../public/game/images/${suit}/${rank}.png`, import.meta.url);
    const jpg = new URL(`../public/game/images/${suit}/${rank}.jpg`, import.meta.url);
    try {
      await readFile(png);
    } catch {
      await readFile(jpg);
    }
  })));
  assert.equal(suits.length * ranks.length, 52);
});
