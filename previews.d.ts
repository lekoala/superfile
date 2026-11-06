import type Superfile from "./superfile.js";
import type { FileEntry } from "./superfile.js";

export interface PreviewOptions {
	container: HTMLElement;
	template?: HTMLTemplateElement;
	image?: HTMLImageElement;
	status?: HTMLElement;
	labels?: {
		preparing?: string;
		error?: string;
		/** Overrides removal button text, including in custom templates. */
		remove?: string;
		removeLabel?: (file: File) => string;
	};
	formatSize?: (bytes: number) => string;
	formatError?: (error: Error, entry: Readonly<FileEntry>) => string;
}

export function connectPreviews(
	sf: Superfile,
	options: PreviewOptions,
): { dispose(): void };
