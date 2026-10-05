// Typen für build/release-notes.mjs – nur für die Tests.
export interface Commit { hash?: string; subject: string }
export interface ParsedCommit { type: string; scope: string; text: string; breaking: boolean }
export interface CommitGroup { title: string; types: string[]; folded?: boolean; items: (ParsedCommit & { hash?: string })[] }

export function changelogSection(changelog: string, version: string): string;
export function parseCommit(subject: string): ParsedCommit;
export function groupCommits(commits: Commit[]): CommitGroup[];
export function fileTable(files: string[]): string;
export function renderNotes(input: {
  tag: string; previous?: string; changelog?: string; commits?: Commit[]; files?: string[]; repo?: string;
}): string;
