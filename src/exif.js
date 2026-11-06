import { configurationError, libraryError } from "./errors.js";
import { createImageProcessor, normalizeImage } from "./image.js";
import { detectImageType } from "./image-types.js";

const jpeg = "image/jpeg";
const png = "image/png";
const webp = "image/webp";
const fail = () => {
	throw libraryError("EXIF_CONTAINER", "Malformed or unsupported EXIF image");
};
const matches = (bytes, offset, values) =>
	values.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes, offset, value) =>
	matches(
		bytes,
		offset,
		Array.from(value, (char) => char.charCodeAt(0)),
	);

// Only orientation affects pixel interpretation. Other TIFF fields need not be
// decoded to remove the complete EXIF container, including unknown/private tags.
function orientation(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const little = ascii(bytes, 0, "II");
	if ((!little && !ascii(bytes, 0, "MM")) || bytes.length < 8) fail();
	if (view.getUint16(2, little) !== 42) fail();
	const offset = view.getUint32(4, little);
	if (offset < 8 || offset + 2 > bytes.length) fail();
	const count = view.getUint16(offset, little);
	if (offset + 2 + count * 12 + 4 > bytes.length) fail();
	let oriented = false;
	for (let i = 0; i < count; i++) {
		const at = offset + 2 + i * 12;
		if (view.getUint16(at, little) !== 274) continue;
		if (
			view.getUint16(at + 2, little) !== 3 ||
			view.getUint32(at + 4, little) !== 1
		)
			fail();
		const value = view.getUint16(at + 8, little);
		if (value < 1 || value > 8) fail();
		oriented ||= value !== 1;
	}
	return oriented;
}

/** @param {Uint8Array} bytes @param {string} type */
export function inspectExif(bytes, type) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const ranges = [];
	let oriented = false;
	const add = (start, end, tiff, tiffEnd = end) => {
		oriented = orientation(bytes.subarray(tiff, tiffEnd)) || oriented;
		ranges.push([start, end]);
	};
	if (type === jpeg) {
		if (!matches(bytes, 0, [255, 216])) fail();
		let at = 2;
		let ended = false;
		let scan = false;
		while (at < bytes.length) {
			if (bytes[at] !== 255) {
				if (!scan) fail();
				at++;
				continue;
			}
			const start = at++;
			while (bytes[at] === 255) at++;
			const marker = bytes[at++];
			if (scan && (marker === 0 || (marker >= 208 && marker <= 215))) continue;
			if (marker === 217) {
				if (at !== bytes.length) fail();
				ended = true;
				break;
			}
			if (marker === undefined || marker === 0 || marker === 216) fail();
			if (marker === 1) continue;
			if (at + 2 > bytes.length) fail();
			const size = view.getUint16(at);
			const end = at + size;
			if (size < 2 || end > bytes.length) fail();
			if (marker === 225 && ascii(bytes, at + 2, "Exif\0\0"))
				add(start, end, at + 8);
			scan = marker === 218;
			at = end;
		}
		if (!ended) fail();
	} else if (type === png) {
		if (!matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) fail();
		let at = 8;
		let ended = false;
		while (at + 12 <= bytes.length) {
			const size = view.getUint32(at);
			const end = at + size + 12;
			if (end > bytes.length) fail();
			if (ascii(bytes, at + 4, "eXIf")) add(at, end, at + 8, end - 4);
			if (ascii(bytes, at + 4, "IEND")) {
				if (size !== 0 || end !== bytes.length) fail();
				ended = true;
				break;
			}
			at = end;
		}
		if (!ended) fail();
	} else if (type === webp) {
		if (
			!ascii(bytes, 0, "RIFF") ||
			!ascii(bytes, 8, "WEBP") ||
			bytes.length < 12
		)
			fail();
		if (view.getUint32(4, true) + 8 !== bytes.length) fail();
		let at = 12;
		while (at + 8 <= bytes.length) {
			const size = view.getUint32(at + 4, true);
			const end = at + 8 + size + (size % 2);
			if (end > bytes.length) fail();
			if (ascii(bytes, at, "EXIF")) {
				// Both raw TIFF and the common Exif-prefixed variant occur in WebP.
				const tiff = at + 8 + (ascii(bytes, at + 8, "Exif\0\0") ? 6 : 0);
				add(at, end, tiff, at + 8 + size);
			}
			at = end;
		}
		if (at !== bytes.length) fail();
	} else fail();
	return { ranges, oriented };
}

export function removeExifBytes(bytes, type) {
	const { ranges, oriented } = inspectExif(bytes, type);
	if (oriented)
		throw libraryError(
			"EXIF_CONTAINER",
			"EXIF orientation must be applied before removal",
		);
	if (!ranges.length) return bytes;
	const result = new Uint8Array(
		bytes.length - ranges.reduce((sum, [start, end]) => sum + end - start, 0),
	);
	let from = 0;
	let to = 0;
	for (const [start, end] of ranges) {
		result.set(bytes.subarray(from, start), to);
		to += start - from;
		from = end;
	}
	result.set(bytes.subarray(from), to);
	if (type === webp) {
		new DataView(result.buffer).setUint32(4, result.length - 8, true);
		let at = 12;
		const view = new DataView(result.buffer);
		while (at + 8 <= result.length) {
			const size = view.getUint32(at + 4, true);
			if (ascii(result, at, "VP8X")) {
				if (size !== 10) fail();
				result[at + 8] &= ~8;
			}
			at += 8 + size + (size % 2);
		}
	}
	return result;
}

function binary(bytes) {
	let result = "";
	for (let at = 0; at < bytes.length; at += 8192)
		result += String.fromCharCode(...bytes.subarray(at, at + 8192));
	return result;
}

function coordinates(tags) {
	const dms = (values, ref, positive, negative, limit) => {
		if (
			!Array.isArray(values) ||
			values.length !== 3 ||
			![positive, negative].includes(ref)
		)
			return null;
		const parts = values.map((pair) =>
			Array.isArray(pair) &&
			pair.length === 2 &&
			pair.every((n) => typeof n === "number" && Number.isFinite(n)) &&
			pair[0] >= 0 &&
			pair[1] > 0
				? pair[0] / pair[1]
				: NaN,
		);
		const value = parts[0] + parts[1] / 60 + parts[2] / 3600;
		if (
			!Number.isFinite(value) ||
			value > limit ||
			parts[1] >= 60 ||
			parts[2] >= 60
		)
			return null;
		return ref === negative ? -value : value;
	};
	const gps = tags.GPS || {};
	const lat = dms(gps[2], gps[1], "N", "S", 90);
	const lon = dms(gps[4], gps[3], "E", "W", 180);
	return lat === null || lon === null ? null : { lat, lon };
}

function validateCodec(codec) {
	if (
		!codec ||
		["load", "dump", "insert"].some((key) => typeof codec[key] !== "function")
	)
		throw configurationError("A piexifjs-compatible codec is required");
}

function imageType(bytes, declared) {
	const detected = detectImageType(bytes);
	if (detected) return detected;
	if (declared.startsWith("image/")) fail();
	return null;
}

/** Read original JPEG metadata; no GPS lookup or timezone conversion.
 * @param {File} file @param {import('../exif.js').ExifCodec} codec
 * @returns {Promise<import('../exif.js').ExifMetadata | null>}
 */
export async function readExif(file, codec) {
	validateCodec(codec);
	const bytes = new Uint8Array(await file.arrayBuffer());
	return imageType(bytes, "") === jpeg ? extractMetadata(bytes, codec) : null;
}

function extractMetadata(bytes, codec) {
	const { ranges } = inspectExif(bytes, jpeg);
	if (!ranges.length) return null;
	if (ranges.length > 1)
		throw libraryError(
			"EXIF_CONTAINER",
			"Multiple EXIF blocks cannot be decoded unambiguously",
		);
	const [start, end] = ranges[0];
	let at = start;
	while (bytes[at] === 255) at++;
	// Decode only the EXIF segment, not a binary-string copy of the whole photo.
	const tags = codec.load(binary(bytes.subarray(at + 3, end)));
	const timestamp =
		tags.Exif?.[36867] || tags.Exif?.[36868] || tags["0th"]?.[306];
	return {
		tags,
		gps: coordinates(tags),
		timestamp: typeof timestamp === "string" ? timestamp : null,
	};
}

async function dimensions(file, input, signal) {
	const view = input.ownerDocument.defaultView;
	const url = view.URL.createObjectURL(file);
	const image = new view.Image();
	const cancel = () => {
		image.src = "";
	};
	try {
		signal.throwIfAborted();
		signal.addEventListener("abort", cancel, { once: true });
		image.src = url;
		await image.decode();
		signal.throwIfAborted();
		return [image.naturalWidth, image.naturalHeight];
	} catch (cause) {
		signal.throwIfAborted();
		throw libraryError("DECODE", `Cannot decode ${file.name}`, Error, cause);
	} finally {
		signal.removeEventListener("abort", cancel);
		image.src = "";
		view.URL.revokeObjectURL(url);
	}
}

/** @param {import('../exif.js').ExifOptions} [options]
 * @returns {import('../superfile.js').FileProcessor}
 */
export function createExifProcessor(options = {}) {
	const {
		mode = "remove",
		process,
		codec,
		preserveGPS = false,
		onMetadata,
	} = options;
	if (!["remove", "preserve"].includes(mode))
		throw configurationError("Invalid EXIF mode");
	if (typeof preserveGPS !== "boolean")
		throw configurationError("preserveGPS must be boolean");
	if (process !== undefined && typeof process !== "function")
		throw configurationError("process must be a function");
	if (onMetadata !== undefined && typeof onMetadata !== "function")
		throw configurationError("onMetadata must be a function");
	if (mode === "preserve" || onMetadata) validateCodec(codec);
	const processor = (file, context) =>
		processor.configure(context.input)(file, context);
	processor.mandatory = true;
	processor.configure = (input) => {
		const imageProcessor = process ?? createImageProcessor();
		const inner = imageProcessor.configure
			? imageProcessor.configure(input)
			: imageProcessor;
		const configured = async (original, context) => {
			const { signal } = context;
			signal.throwIfAborted();
			const originalBytes = new Uint8Array(await original.arrayBuffer());
			const originalType = imageType(originalBytes, original.type);
			signal.throwIfAborted();
			if (mode === "preserve" && originalType && originalType !== jpeg)
				throw libraryError(
					"UNSUPPORTED_FORMAT",
					"EXIF preservation only supports JPEG",
				);
			const metadata =
				originalType === jpeg && (mode === "preserve" || onMetadata)
					? extractMetadata(originalBytes, codec)
					: null;
			// Keep a private per-file snapshot before application callbacks run.
			const tags =
				mode === "preserve" && metadata ? structuredClone(metadata.tags) : null;
			signal.throwIfAborted();
			if (onMetadata) await onMetadata(metadata, original, context);
			signal.throwIfAborted();
			const source =
				originalType && originalType !== original.type
					? new input.ownerDocument.defaultView.File(
							[originalBytes],
							original.name,
							{
								type: originalType,
								lastModified: original.lastModified,
							},
						)
					: original;
			const processed = await inner(source, context);
			let file =
				processed && typeof processed === "object" && "file" in processed
					? processed.file
					: processed;
			if (!(file instanceof input.ownerDocument.defaultView.File))
				throw libraryError(
					"PROCESSOR_RESULT",
					"An EXIF image processor must return a File",
					TypeError,
				);
			signal.throwIfAborted();
			let bytes =
				file === source
					? originalBytes
					: new Uint8Array(await file.arrayBuffer());
			const type = imageType(bytes, file.type);
			if (!type) return { file, decision: "not-applicable" };
			if (type !== file.type)
				file = new input.ownerDocument.defaultView.File([bytes], file.name, {
					type,
					lastModified: file.lastModified,
				});
			const info = inspectExif(bytes, file.type);
			if (mode === "remove") {
				if (info.oriented) {
					const normalized = await normalizeImage(file, context);
					file = normalized.file || normalized;
					bytes = new Uint8Array(await file.arrayBuffer());
				}
				const clean = removeExifBytes(bytes, file.type);
				signal.throwIfAborted();
				return {
					file:
						clean === bytes
							? file
							: new input.ownerDocument.defaultView.File([clean], file.name, {
									type: file.type,
									lastModified: file.lastModified,
								}),
					decision: "exif-removed",
				};
			}
			if (file.type !== jpeg)
				throw libraryError(
					"UNSUPPORTED_FORMAT",
					"EXIF preservation requires JPEG output",
				);
			if (!tags) return { file, decision: "exif-absent" };
			if (!preserveGPS) tags.GPS = {};
			tags["1st"] = {};
			tags.thumbnail = null;
			if (file !== source) {
				if (info.oriented)
					throw libraryError(
						"EXIF_CONTAINER",
						"Transformed JPEG must have normalized pixels",
					);
				const [width, height] = await dimensions(file, input, signal);
				tags["0th"][274] = 1;
				tags["0th"][256] = width;
				tags["0th"][257] = height;
				tags.Exif[40962] = width;
				tags.Exif[40963] = height;
			}
			const restored = codec.insert(codec.dump(tags), binary(bytes));
			const output = Uint8Array.from(restored, (char) => char.charCodeAt(0));
			inspectExif(output, jpeg);
			signal.throwIfAborted();
			return {
				file: new input.ownerDocument.defaultView.File([output], file.name, {
					type: jpeg,
					lastModified: file.lastModified,
				}),
				decision: "exif-preserved",
			};
		};
		configured.mandatory = true;
		return configured;
	};
	return processor;
}
