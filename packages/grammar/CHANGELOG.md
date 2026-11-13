# Changelog of the `inventorybot-grammar` module

The module's version follows its entry's API (`src/index.ts`), not any repository's releases
(InventoryBotTron's CLAUDE.md, "Versions").

## 0.3.1 (2026-11-12)

- The grammar's specification, `docs/bot-protocol.md`, moved from the InventoryBot wiki to
  InventoryBotTron ([docs/bot-protocol.md](../../docs/bot-protocol.md)), and the entry's comment
  names it there. No change to what the entry exports or means.

## 0.3.0 (2026-11-12)

- **Breaking: the module moved, and its import name changed.** It now lives in
  [InventoryBotTron](https://github.com/djjeck/InventoryBotTron) (`packages/grammar`), and it
  provides `@inventorybottron/grammar` instead of `@inventorybot-wiki/grammar`. Its id is still
  `inventorybot-grammar`, so an install from InventoryBotTron replaces the InventoryBot wiki's in
  place. A module that imports it changes its imports to the new name and its `imports` range to
  `^0.3.0`; until it does, it must keep the wiki's install (0.2.0), since MegaBotTron1999 refuses a
  module whose import no installed module provides.
- No change to what the entry exports or means. The sources are those of the InventoryBot wiki at
  commit `1ca8615` (djjeck/inventorybot-wiki), with comments that named real game content made
  generic.

## 0.2.0 and before

In the InventoryBot wiki's history (`packages/grammar`, up to commit `1ca8615`).
