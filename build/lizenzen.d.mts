import type { Plugin } from 'vite';

export const SHELLS: string[];
export function packageOf(id: string): string | null;
export function packageLicense(root: string, name: string): { name: string; version: string; license: string; text: string };
export function ownLicense(root: string): { name: string; version: string; license: string; text: string };
export function licenseText(root: string, names: string[]): string;
export function licenses(root: string): Plugin;
