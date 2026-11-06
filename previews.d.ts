import type Superfile from "./superfile.js";

export interface PreviewOptions {
	container: HTMLElement;
	template?: HTMLTemplateElement;
	image?: HTMLImageElement;
	status?: HTMLElement;
}

export function connectPreviews(
	sf: Superfile,
	options: PreviewOptions,
): { dispose(): void };
