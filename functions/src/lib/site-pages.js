// The site's own pages, as search cards: so "garden" finds Eden and "game"
// finds Camino. Written by hand from each page's title and description;
// test/search-docs.test.js checks every url is a real page in sitemap.xml.
// `keywords` are extra words people might type that the description lacks.

const SITE_PAGES = [
  {
    name: 'home', url: '/', title: 'Machina Christi',
    description: 'A gathering place of experiences: the Workshop, Camino, Eden, Ordo and Pray.',
    keywords: ['home', 'start'],
  },
  {
    name: 'camino', url: '/game.html', title: 'Camino: the runner',
    description: 'An endless runner. Swipe to walk the pilgrim road, where verses light the way.',
    keywords: ['game', 'play', 'pilgrim', 'pilgrimage', 'run', 'verses', 'scripture'],
  },
  {
    name: 'eden', url: '/world.html', title: 'Eden: the garden',
    description: 'A living 3D garden you can wander, tended and refined by the machine over time.',
    keywords: ['garden', 'world', '3d', 'walk', 'nature', 'creation'],
  },
  {
    name: 'ordo', url: '/ordo.html', title: 'Ordo: today in the Church',
    description: "The day's Gospel reading and, on a feast or memorial, the saint of the day.",
    keywords: ['calendar', 'liturgy', 'liturgical', 'gospel', 'reading', 'feast', 'saint of the day', 'season'],
  },
  {
    name: 'pray', url: '/pray.html', title: 'Pray: prayers in Thai and English',
    description: 'Classic Catholic prayers in Thai and English, line by line, with a pronunciation guide and read-aloud.',
    keywords: ['prayers', 'thai', 'learn thai', 'pronunciation', 'listen', 'audio'],
  },
  {
    name: 'workshop', url: '/workshop.html', title: 'The Workshop',
    description: 'Every tool that builds and keeps Machina Christi, set as columns of light in a square after St Peter\'s.',
    keywords: ['how it is built', 'technology', 'tools', 'azure', 'code'],
  },
  {
    name: 'about', url: '/about.html', title: 'About Machina Christi',
    description: 'The site, the runner, the garden, today in the Church, and prayers in Thai and English.',
    keywords: ['about', 'story', 'why'],
  },
  {
    name: 'about-camino', url: '/about-camino.html', title: 'About Camino',
    description: 'About Camino, the endless runner.',
    keywords: ['game', 'how to play'],
  },
  {
    name: 'about-eden', url: '/about-eden.html', title: 'About Eden',
    description: 'About Eden, the living 3D garden, and its changelog.',
    keywords: ['garden', 'changelog', 'updates'],
  },
  {
    name: 'about-ordo', url: '/about-ordo.html', title: 'About Ordo',
    description: 'About Ordo, the page for today in the Church, and where its saints\' lives come from.',
    keywords: ['calendar', 'sources', "butler's lives"],
  },
  {
    name: 'about-pray', url: '/about-pray.html', title: 'About Pray',
    description: 'About Pray, classic Catholic prayers in Thai and English, because God can be honored in every language.',
    keywords: ['thai', 'translation', 'sources', 'voices'],
  },
  {
    name: 'about-workshop', url: '/about-workshop.html', title: 'About the Workshop',
    description: 'How Machina Christi is built, every tool set as a column of light.',
    keywords: ['how it is built', 'technology'],
  },
];

module.exports = { SITE_PAGES };
