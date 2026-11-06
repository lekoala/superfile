import type { FileProcessor } from "./superfile.js";

export interface ImageOptions {
	maxWidth?: number | string;
	maxHeight?: number | string;
	ratio?: number | string;
	quality?: number | string;
	format?: "image/jpeg" | "image/png" | "image/webp";
	fallback?: "block" | "original";
	background?: string;
}

export function createImageProcessor(options?: ImageOptions): FileProcessor;
