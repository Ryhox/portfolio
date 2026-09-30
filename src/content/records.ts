/**
 * The records on the Resonance cabinet: real songs, played as the 30-second previews Apple Music offers
 * for every track (streamed from Apple, each linking to the full song). Music and artwork belong to the
 * artists and their labels.
 *
 * One line per song: its Apple ID (the `i=` number in a music.apple.com song link, or from
 * https://itunes.apple.com/search?term=…&entity=song). Preview and link are looked up from Apple
 * the first time something plays.
 */
export type Record = {
  apple: number;
  title: string;
  artist: string;
  album: string;
  explicit?: boolean;
};

export const records: Record[] = [
  { apple: 1819861157, title: 'Tears', artist: 'Sabrina Carpenter', album: 'Man’s Best Friend' },
  { apple: 1631586651, title: "emails i can't send", artist: 'Sabrina Carpenter', album: "emails i can't send" },
  { apple: 1795513495, title: "Couldn't Make It Any Harder", artist: 'Sabrina Carpenter', album: "Short n' Sweet (Deluxe)", explicit: true },
  { apple: 1631586877, title: 'because i liked a boy', artist: 'Sabrina Carpenter', album: "emails i can't send" },
  { apple: 1836002628, title: 'Go Go Juice', artist: 'Sabrina Carpenter', album: 'Man’s Best Friend' },
  { apple: 158618071, title: 'Vienna', artist: 'Billy Joel', album: 'The Stranger' },
  { apple: 158617575, title: 'Piano Man', artist: 'Billy Joel', album: 'Piano Man' },
];
