# The invented universe

Every item, recipe, place and Telegram username in the code, tests and docs of this repository is
invented: real game content is meant to be discovered by playing, and never belongs here
([CLAUDE.md](../CLAUDE.md), "Game content"). This file lists the invented world. Tests and docs use
names from it; a new invented name is added here, in the same change. It shares its names with the
InventoryBot wiki's own universe, so that a test or example can move between the two unchanged.

`npm run check:universe` (`scripts/check-universe.ts`, run by `validate`, `ci` and GitHub CI)
enforces it: wherever the bot's reply formats put an item, a recipe or a place, in the item tuples
of the tests' reply builders, and wherever an `@username` is written (`scripts/universe.ts`), the
name must be in the lists below. Names are compared ignoring case and runs of spaces; places include
their preposition and emoji, as the bot writes them.

Before adding a name, make sure it is not a real one. Public facts the bot tells every player
(command names, the `/faq`, fixed reply texts) are not entities and need no entry. A trailing
`<!-- … -->` comment explains an entry where needed: `public: …` marks the rare real name that every
player sees anyway in a fixed reply text, and says why it is allowed.

## Items

- name <!-- a placeholder in grammars and comments (NAME, `- name [R]`) -->
- un astrolabio da cartografo
- un barattolo di miele
- un biscotto Lunetta
- un biscotto Stellina
- un colino di plastica
- un dado a dodici facce
- un dado di legno
- un elegante cappello piumato
- un fiorino ƒ
- un fischietto di quelli da carnevale
- un floppy disk incrinato
- un granello di sale grosso
- un grembiule da cuoco
- un nastro da pacchi
- un paio di mollette
- un piccolo annaffiatoio
- un sasso
- un secchio di fango
- un seme di Zaffirella
- un tappetino con scritto Benvenuti
- un torroncino al pistacchio
- un trifoglio di latta
- un tubetto di colla verde
- un uovo di quaglia
- un vortice
- un vortice croccante di energia biscottosa
- una caps rossa
- una chiave di ebano 🔑
- una conchiglia
- una ghianda
- una ghianda d'oro
- una moneta d'oro <!-- public: the game's currency, named in the bot's fixed level-up text -->
- una perla
- una sedia pieghevole
- una spada
- una spada di cartone
- una spada di legno
- una spada di legno, piccola ma robusta

## Recipes

- Gara di cucina
- Merenda veloce
- Muro
- Pratica cestina
- Torre

## Places

- in cima al monte Grevolo 🏔
- nel bosco nebbioso di Valtorbo 🌲
- nella baia di Scogliola 🦀
- nella palude sussurrante 🌾
- nella valle ventosa 🏞
- nelle cripte del monastero 👻
- sul banco corallino 🐠
- sulla scogliera bianca 🏖

## Usernames

Without `@`. Placeholders used in prose and comments (`@u`, `@username`) count as invented names.

- aldo
- d
- gino_x
- InventoryBot <!-- public: the bot itself -->
- lucia_b
- mario_r
- msx80 <!-- public: the game's author and admin, in the bot's own texts -->
- u
- user
- username
- utente
- v
- w
- x
