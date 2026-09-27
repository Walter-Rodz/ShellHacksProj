import { z } from 'zod';

/*
 * Lets search filters accept the names people (and the AI) actually use, like "PS1", "GameCube" or
 * "Clamshell", instead of only the backend's exact ids ("psx", "gc", "clamshell").
 * Matching ignores case, spaces and punctuation, so "Game Boy Advance", "gameboy-advance" and "GBA" all work.
 */

/** Common names -> system id. Keys are written in "squashed" form: lowercase letters and digits only. */
const SYSTEM_NAMES: Record<string, string> = {
  gameboy: 'gb',
  gameboycolor: 'gbc',
  gameboyadvance: 'gba',
  gamegear: 'gg',
  famicom: 'nes',
  nintendoentertainmentsystem: 'nes',
  supernintendo: 'snes',
  supernes: 'snes',
  superfamicom: 'snes',
  sfc: 'snes',
  genesis: 'md',
  megadrive: 'md',
  segagenesis: 'md',
  segamegadrive: 'md',
  pcengine: 'pce',
  turbografx: 'pce',
  turbografx16: 'pce',
  tg16: 'pce',
  mame: 'arcade',
  neogeo: 'arcade',
  cps: 'arcade',
  ps1: 'psx',
  psone: 'psx',
  playstation: 'psx',
  playstation1: 'psx',
  nintendo64: 'n64',
  saturn: 'saturn',
  segasaturn: 'saturn',
  ds: 'nds',
  nintendods: 'nds',
  dreamcast: 'dc',
  segadreamcast: 'dc',
  playstationportable: 'psp',
  gamecube: 'gc',
  ngc: 'gc',
  nintendogamecube: 'gc',
  playstation2: 'ps2',
  nintendowii: 'wii',
  nintendo3ds: '3ds',
  psvita: 'vita',
  playstationvita: 'vita',
  nintendoswitch: 'switch',
  pico8: 'pico8',
};

/** Common names -> emulation tier id */
const TIER_NAMES: Record<string, string> = {
  ps1: 'ps1',
  psx: 'ps1',
  playstation: 'ps1',
  playstation1: 'ps1',
  n64: 'n64',
  nintendo64: 'n64',
  ps2gc: 'ps2_gc',
  ps2: 'ps2_gc',
  playstation2: 'ps2_gc',
  gc: 'ps2_gc',
  gamecube: 'ps2_gc',
  switch: 'switch',
  nintendoswitch: 'switch',
};

const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "PS1" -> "psx", "GameCube" -> "gc". Names it doesn't know are returned lowercased, unchanged otherwise. */
export function toSystemId(name: string) {
  return SYSTEM_NAMES[squash(name)] ?? name.trim().toLowerCase();
}

/** "PS2/GC" -> "ps2_gc", "PlayStation" -> "ps1". Unknown names are returned lowercased. */
export function toTierId(name: string) {
  return TIER_NAMES[squash(name)] ?? name.trim().toLowerCase();
}

/** A string param that must be one of `values`, ignoring case ("Clamshell" -> "clamshell") */
export function caseInsensitiveEnum<const T extends string>(values: readonly T[]) {
  return z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(values as [T, ...T[]]));
}
