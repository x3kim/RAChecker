// Type surface for region.js, so the TypeScript frontends (web + mobile) can
// import the very same parser the server uses.

export interface RomTags {
  regions: string[];
  languages: string[];
}

export declare const REGION_NAMES: Record<string, string>;
export declare const REGION_ORDER: string[];
export declare const LANGUAGE_NAMES: Record<string, string>;
export declare const LANG_PREFIX: string;
export declare const TAG_PARSER_VERSION: number;

export declare function romBasename(p: string): string;
export declare function parseRomTags(name: string): RomTags;

export declare function langToken(code: string): string;
export declare function isLangToken(tok: string): boolean;
export declare function tokenCode(tok: string): string;
export declare function tokenLabel(tok: string): string;
export declare function tokenName(tok: string): string;
export declare function tagTokens(tags: Partial<RomTags>): string[];

export declare function rankTokens(tokens: string[] | null | undefined, priority: string[] | null | undefined): number;
export declare function rankFilename(name: string, priority: string[] | null | undefined): number;

export declare function packTags(tags: Partial<RomTags>): { region: string; langs: string };
export declare function unpackTags(row: { region?: string | null; langs?: string | null }): RomTags;
