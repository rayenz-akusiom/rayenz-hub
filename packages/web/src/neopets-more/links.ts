export type MoreLink = {
  id: string;
  label: string;
  url: string;
  img: string;
  note?: string;
};

export const MORE_LINKS: MoreLink[] = [
  {
    id: 'kiko-solver',
    label: 'Kiko Match Solver',
    url: 'https://kiko-match-solver.vercel.app/',
    img: 'https://images.neopets.com/items/toy_kiko_plushie.gif',
  },
  {
    id: 'abandoned-attic',
    label: 'Almost Abandoned Attic',
    url: 'https://www.neopets.com/halloween/garage.phtml',
    img: 'https://images.neopets.com/items/fur_cobwebs.gif',
    note: 'Restock times vary',
  },
  {
    id: 'tyrannian-battleground',
    label: 'Tyrannian Battleground',
    url: 'https://www.neopets.com/prehistoric/battleground/',
    img: 'https://images.neopets.com/items/bd_tyweof2013_itsashovel.gif',
    note: 'Daily',
  },
  {
    id: 'golden-dubloon',
    label: 'Golden Dubloon Menu',
    url: 'https://www.neopets.com/~SparklesRoyal',
    img: 'https://images.neopets.com/items/piratefood_9.gif',
    note: 'Split Dubloons',
  },
  {
    id: 'altador-cup-winners',
    label: 'Altador Cup',
    url: 'https://www.neopets.com/altador/colosseum/winners.phtml',
    img: 'https://images.neopets.com/items/toy_altcp_board_game.gif',
  },
  {
    id: 'tvw',
    label: 'The Void Within',
    url: 'https://www.neopets.com/tvw/',
    img: 'https://images.neopets.com/homepage/marquee/icons/TVW_event_icon.png',
  },
];
