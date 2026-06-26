// English — the SOURCE OF TRUTH for every user-facing string. Every other language
// file is typed `Record<StringKey, string>` against the keys defined here, so the
// build fails if a translation is missing a key. `{name}` tokens are interpolated
// at render time (see ./index.ts). Proper nouns, URLs, brand/tech names and license
// tags are intentionally NOT keyed — they stay identical across languages.
export const en = {
  // ── Settings sheet: tabs ──────────────────────────────────────────────────
  'tab.settings': 'Settings',
  'tab.credits': 'Credits',
  'tab.socials': 'Socials',

  // ── Settings rows ─────────────────────────────────────────────────────────
  'settings.graphics': 'Graphics',
  'settings.language': 'Language',
  'settings.motionBlur': 'Motion blur',
  'settings.blurStrength': 'Blur strength',
  'settings.motionBlurNote': 'Needs Medium or High graphics',
  'settings.music': 'Music',
  'settings.soundFx': 'Sound Fx',
  'settings.invertX': 'Invert X axis',
  'settings.invertY': 'Invert Y axis',
  'settings.applying': 'applying…',
  'settings.min': 'Min',
  'settings.max': 'Max',
  'quality.Low': 'Low',
  'quality.Medium': 'Medium',
  'quality.High': 'High',

  // ── Credits tab ───────────────────────────────────────────────────────────
  'credits.line1': 'A cozy island.',
  'credits.line2': 'Design & code by Emanuel Pfeifer.',
  'credits.line3': 'Built with React Three Fiber & three.js.',
  'credits.inspiration': 'Inspiration',
  'credits.assets': 'Assets',
  'credits.basicIdea': 'basic idea',
  'credits.stargazeFeature': 'stargaze feature',
  'credits.forGivingIdeas': 'for giving ideas',

  // ── Socials tab ───────────────────────────────────────────────────────────
  'socials.contact': 'Contact me <3',
  'socials.email': 'Email',
  'socials.github': 'GitHub',
  'socials.organisation': 'Organisation',

  // ── External-link warning ─────────────────────────────────────────────────
  'ext.title': 'Heads up — external site',
  'ext.text': 'This link leaves the island and opens an outside website:',
  'ext.stay': 'Stay here',
  'ext.continue': 'Continue',

  // ── To-Do checklist ───────────────────────────────────────────────────────
  'quest.about.label': 'Who am I?',
  'quest.about.hint': 'Find the cat keeping watch on the hilltop',
  'quest.socials.label': 'Socials',
  'quest.socials.hint': 'Catch me out there in the world',
  'quest.projects.label': 'Projects',
  'quest.projects.hint': 'Read the board at the end of the west path',
  'quest.sail.label': 'Set Sail',
  'quest.sail.hint': "Drift out to other wanderers' isles",
  'quest.enjoy.label': 'Enjoy the isle!',
  'quest.enjoy.hint': 'Wander, sit a while, breathe',
  'quest.todo': 'To-Do',
  'quest.soon': 'soon',
  'quest.closeAria': 'Close to-do',

  // ── About-me panel ────────────────────────────────────────────────────────
  'about.tagline': '♥ committing straight to production ♥',
  'about.body':
    "Hey! I'm Ryhox. I like building random stuff and seeing where it goes. Mostly working on websites, 3D stuff, plugins, and whatever sounds fun at the moment. A lot of my projects start with \"this could be cool\" and somehow turn into a real thing after way too many hours of debugging.",
  'about.closeDesktop': 'Press E or ESC to close',
  'about.closeTouch': 'Tap Close to close',

  // ── Intro / start screen ──────────────────────────────────────────────────
  'intro.welcome': 'WELCOME',
  'intro.beginDesktop': 'CLICK ANYWHERE TO BEGIN',
  'intro.beginTouch': 'TAP ANYWHERE TO BEGIN',

  // ── Loading screen captions ───────────────────────────────────────────────
  'loading.sorry': 'sorry for the loading time',
  'loading.gatheringMagic': 'gathering magic',
  'loading.assets': 'gathering magic',
  'loading.models': 'loading models',
  'loading.textures': 'loading textures',
  'loading.audio': 'loading audio',
  'loading.skies': 'loading skies',
  'loading.summoning': 'summoning the island',
  'loading.compiling': 'compiling shaders',
  'loading.uploading': 'uploading textures',
  'loading.preparing': 'preparing scene',
  'loading.ready': 'ready',

  // ── HUD keyboard legend (Brand) ───────────────────────────────────────────
  'hint.move': 'Move',
  'hint.look': 'Look',
  'hint.sprint': 'Sprint',
  'hint.steer': 'Steer',
  'hint.stepAshore': 'Step ashore',
  'hint.newIsles': 'New isles',
  'hint.mute': 'Mute',
  'hint.settings': 'Settings',
  'brand.openMenuAria': 'Open menu',

  // ── Projects board control bar ────────────────────────────────────────────
  'board.source': 'Source',
  'board.livePreview': 'Live preview',
  'board.preview': 'Preview',
  'board.noLinks': 'no links',
  'board.leaveDesktop': 'E or ESC to leave',
  'board.leaveTouch': 'Tap ✕ to close',
  'board.closeAria': 'Close',
  'board.prevAria': 'Previous',
  'board.nextAria': 'Next',

  // ── Project descriptions (board papers) ───────────────────────────────────
  'project.portfolio.desc':
    'This cozy island itself — an interactive 3D portfolio with a day/night cycle, a sailable boat and a hilltop shrine. Built from scratch, no engine.',
  'project.pokyh.desc':
    'The frontend for Pokyh — a clean, modern web app interface built with a component-driven TypeScript stack.',
  'project.wieland.desc':
    'A personal AI assistant project — wiring up a language model into a helpful, conversational tool.',
  'project.minesweeper.desc':
    'The classic Minesweeper, rebuilt for the web — quick, clean and playable right in the browser.',

  // ── Island information panel ──────────────────────────────────────────────
  'info.information': 'Information',
  'info.region': '{group} · {tier} region',
  'info.landInRegion': 'Land in this region',
  'info.typesHere': 'Types you can roll here',
  'info.islandSizes': 'Island sizes',
  'info.look': 'Look',
  'info.size': 'Size',
  'info.overallRarity': 'Overall rarity',
  'info.oneIn': '≈ 1 in {n} islands',
  'info.closeDesktop': 'Press I or ESC to close',
  'info.closeTouch': 'Tap the i button to close',

  // ── Entering-island banner ────────────────────────────────────────────────
  'entering.eyebrow': 'You are entering',

  // ── Minimap / archipelago footer ──────────────────────────────────────────
  'minimap.stargazer': 'Stargazer',
  'minimap.stargazers': 'Stargazers',
  'minimap.nextUpdate': 'Next possible update in',
  'minimap.sailHome': 'Sail home',
  'minimap.worldMap': 'World map',

  // ── Touch controls ────────────────────────────────────────────────────────
  'touch.close': 'Close',
  'touch.standUp': 'Stand up',
  'touch.stepAshore': 'Step ashore',
  'touch.home': 'Home',
  'touch.moveLookHint': 'Left to move · drag right to look',
  'touch.infoAria': 'Island information',
  'touch.closeInfoAria': 'Close information',
  'touch.worldMapAria': 'World map',

  // ── Touch disclaimer ──────────────────────────────────────────────────────
  'disclaimer.text': 'Best experienced on desktop',
  'disclaimer.dismissAria': 'Dismiss',

  // ── Sit / hold-to-sail hints ──────────────────────────────────────────────
  'sit.standUp': 'Press E or ESC to stand up',
  'hold.sailHome': 'Sail home',

  // ── In-world interact markers ─────────────────────────────────────────────
  'marker.sit.label': 'Sit',
  'marker.sit.hint.desktop': 'press E to rest',
  'marker.sit.hint.touch': 'tap to rest',
  'marker.projects.label': 'Projects',
  'marker.projects.hint.desktop': 'press E to read',
  'marker.projects.hint.touch': 'tap to read',
  'marker.about.label': 'About me',
  'marker.about.hint.desktop': 'press E to read',
  'marker.about.hint.touch': 'tap to read',
  'marker.social.email': 'Email',
  'marker.social.github': 'GitHub',
  'marker.social.discord': 'Discord',
  'marker.discord.hint.desktop': 'press E to copy',
  'marker.discord.hint.touch': 'tap to copy',
  'marker.setSail': 'Set sail',

  // ── Summit toast ──────────────────────────────────────────────────────────
  'summit.discordCopied': 'Discord copied — {handle}',

  // ── World map overlay ─────────────────────────────────────────────────────
  'map.title': 'The Archipelago',
  'map.closeAria': 'Close map',
  'map.cta': 'Do you want your own island?',
  'map.star': 'Star this repo',
  'map.nextUpdate': 'Next possible update in:',
  'map.searchPlaceholder': 'Search a stargazer…',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'map.hintTouch': 'Tap an island to travel there · ✕ to close',
  'map.hintDesktop': 'Hover an island for its owner · click to travel there · Esc to close',
  'map.motherIsle': 'Mother Isle',
  'map.teleport': 'Teleport',
  'map.to': 'To',

  // ── Map fade transition captions ──────────────────────────────────────────
  'transition.settingSail': 'Setting sail…',
  'transition.comingAshore': 'Coming ashore…',

  // ── Procedural island data (descriptive enums — fantasy place/look names stay) ─
  'tier.common': 'common',
  'tier.uncommon': 'uncommon',
  'tier.rare': 'rare',
  'tier.epic': 'epic',
  'tier.legendary': 'legendary',
  'size.small': 'Small island',
  'size.medium': 'Medium island',
  'size.large': 'Large island',
  'size.huge': 'Huge island',
  'luck.legendary': 'Legendary luck!',
  'luck.incredible': 'Incredibly lucky!',
  'luck.lucky': 'Lucky find!',
  'luck.tidy': 'A tidy roll',
  'luck.common': 'A common roll',
  'luck.heart': 'The heart of this region',
} as const

export type StringKey = keyof typeof en
