/** Stable codes for library errors; callback errors and AbortError are unchanged. */
export type SuperfileErrorCode =
	| "CONFIGURATION"
	| "MAX_SIZE"
	| "PROCESSOR_RESULT"
	| "FILE_LIST"
	| "DECODE"
	| "ENCODE"
	| "UNSUPPORTED_FORMAT"
	| "EXIF_CONTAINER";

export interface SuperfileError extends Error {
	readonly code: SuperfileErrorCode;
	readonly cause?: unknown;
}

export interface FileEntry {
	readonly id: string;
	readonly original: File;
	readonly file: File;
	readonly status: "pending" | "processing" | "ready" | "error";
	readonly transformed: boolean;
	readonly error: Error | null;
	readonly decision: string | null;
}

export interface ProcessingContext {
	input: HTMLInputElement;
	signal: AbortSignal;
	generation: number;
	entry: Readonly<FileEntry>;
}

export type ProcessResult = File | { file: File; decision?: string };
export interface FileProcessor {
	(
		file: File,
		context: ProcessingContext,
	): ProcessResult | Promise<ProcessResult>;
	configure?: (input: HTMLInputElement) => FileProcessor;
	mandatory?: boolean;
}

export interface SuperfileOptions {
	process?: FileProcessor;
	maxSize?: number;
	validate?: (file: File, context: ProcessingContext) => void | Promise<void>;
	dropTarget?: HTMLElement;
}

export interface SuperfileEventDetail {
	generation: number;
	entries: Readonly<FileEntry>[];
	files?: FileList;
	id?: string | null;
	error?: Error;
	blocking?: boolean;
}

export default class Superfile {
	constructor(input: HTMLInputElement, options?: SuperfileOptions);
	static get(input: HTMLInputElement): Superfile | undefined;
	static init(selector?: string, options?: SuperfileOptions): Superfile[];
	readonly input: HTMLInputElement;
	readonly files: FileList;
	readonly entries: Readonly<FileEntry>[];
	readonly state: "ready" | "processing" | "error";
	readonly generation: number;
	addFiles(
		files: Iterable<File> | ArrayLike<File>,
	): Promise<Readonly<FileEntry>[]>;
	removeFile(id: string): Promise<Readonly<FileEntry>[]>;
	clear(): void;
	whenReady(): Promise<Readonly<FileEntry>[]>;
	dispose(): void;
}
