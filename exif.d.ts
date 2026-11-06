import type { FileProcessor, ProcessingContext } from "./superfile.js";

export interface ExifData {
	"0th": Record<number, unknown>;
	Exif: Record<number, unknown>;
	GPS: Record<number, unknown>;
	"1st"?: Record<number, unknown>;
	thumbnail?: string | null;
	[key: string]: unknown;
}

/** Compatible with piexifjs; supplied by the application, never loaded implicitly. */
export interface ExifCodec {
	load(data: string): ExifData;
	dump(data: ExifData): string;
	insert(exif: string, jpeg: string): string;
}

export interface ExifMetadata {
	tags: ExifData;
	gps: { lat: number; lon: number } | null;
	/** Original EXIF wall time, without an invented timezone. */
	timestamp: string | null;
}

export interface ExifOptions {
	mode?: "remove" | "preserve";
	/** Optional image/custom processor, configured once per input. */
	process?: FileProcessor;
	/** Required for preservation and metadata extraction (JPEG only). */
	codec?: ExifCodec;
	/** Preservation excludes GPS unless explicitly enabled. */
	preserveGPS?: boolean;
	onMetadata?: (
		metadata: ExifMetadata | null,
		file: File,
		context: ProcessingContext,
	) => void | Promise<void>;
}

export function readExif(
	file: File,
	codec: ExifCodec,
): Promise<ExifMetadata | null>;
export function createExifProcessor(options?: ExifOptions): FileProcessor;
