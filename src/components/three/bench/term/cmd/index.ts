import type { Cmd } from '../shell';
import { fileCommands } from './files';
import { funCommands } from './fun';
import { siteCommands } from './site';
import { systemCommands } from './system';
import { textCommands } from './text';

/** Every command the Lumen 64 answers to. */
export const COMMANDS: Record<string, Cmd> = { ...fileCommands, ...textCommands, ...systemCommands, ...funCommands, ...siteCommands };
