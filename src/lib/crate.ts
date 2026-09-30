/**
 * The records beside the Resonance cabinet: the list is type (DOM), the discs that travel are 3D.
 * The cabinet's mechanism writes where each disc is, every frame, and the list follows it.
 *
 * - `rest`: in its sleeve
 * - `pulled`: chosen, drawn out of the sleeve, waiting for the drawer
 * - `away`: the 3D disc has it (in the air, or in the drawer)
 */
export type DiscAt = 'rest' | 'pulled' | 'away';

export const crateFx = {
  disc: [] as DiscAt[],
};
