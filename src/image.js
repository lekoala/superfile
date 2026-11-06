import { configurationError, libraryError } from "./errors.js";
import { detectImageType } from "./image-types.js";

const safeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensions = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

/**
 * @typedef {object} ParsedImageOptions
 * @property {number} [maxWidth]
 * @property {number} [maxHeight]
 * @property {number} [ratio]
 * @property {number} [quality]
 * @property {"image/jpeg" | "image/png" | "image/webp"} [format]
 * @property {"block" | "original"} fallback
 * @property {string} background
 * @property {boolean} mandatory
 * @property {boolean} active
 * @property {boolean} reencode
 */

function number(value, name) {
	if (
		(typeof value !== "number" && typeof value !== "string") ||
		String(value).trim() === ""
	)
		throw configurationError(`${name} must be a number`);
	const result = Number(value);
	if (!Number.isFinite(result))
		throw configurationError(`${name} must be finite`);
	return result;
}

/** @param {import("../image.js").ImageOptions} [options] */
export function parseImageOptions(options = {}) {
	/** @type {ParsedImageOptions} */
	const config = {
		fallback: options.fallback ?? "block",
		background: options.background ?? "#ffffff",
		mandatory: false,
		active: false,
		reencode: options.reencode ?? false,
	};
	if (typeof config.reencode !== "boolean")
		throw configurationError("reencode must be a boolean");
	if (!["block", "original"].includes(config.fallback))
		throw configurationError("fallback must be block or original");
	for (const key of ["maxWidth", "maxHeight"]) {
		if (options[key] == null) continue;
		const value = number(options[key], key);
		if (!Number.isInteger(value) || value <= 0)
			throw configurationError(`${key} must be a positive integer`);
		config[key] = value;
	}
	if (options.ratio != null) {
		const parts = String(options.ratio).split(/[:/]/);
		if (parts.length > 2)
			throw configurationError("ratio must be positive, e.g. 16:9 or 4/3");
		const values = parts.map((part) => number(part, "ratio"));
		if (values.some((value) => value <= 0))
			throw configurationError("ratio must be positive");
		config.ratio = values[0] / (values[1] ?? 1);
		if (!Number.isFinite(config.ratio) || config.ratio <= 0)
			throw configurationError("ratio is out of range");
	}
	if (options.quality != null) {
		let quality = number(options.quality, "quality");
		if (quality > 1 && Number.isInteger(quality)) quality /= 100;
		if (quality < 0 || quality > 1)
			throw configurationError(
				"quality must be 0–1 or an integer percentage 0–100",
			);
		config.quality = quality;
	}
	if (options.format != null) {
		if (!safeTypes.has(options.format))
			throw configurationError(
				"format must be image/jpeg, image/png or image/webp",
			);
		config.format = options.format;
	}
	config.mandatory = !!(
		config.reencode ||
		config.maxWidth ||
		config.maxHeight ||
		config.ratio ||
		config.format
	);
	config.active = config.mandatory || config.quality !== undefined;
	return Object.freeze(config);
}

export function imageGeometry(width, height, config) {
	let sourceWidth = width;
	let sourceHeight = height;
	if (config.ratio) {
		if (width / height > config.ratio) sourceWidth = height * config.ratio;
		else sourceHeight = width / config.ratio;
	}
	const scale = Math.min(
		1,
		(config.maxWidth || Infinity) / sourceWidth,
		(config.maxHeight || Infinity) / sourceHeight,
	);
	return {
		x: (width - sourceWidth) / 2,
		y: (height - sourceHeight) / 2,
		sourceWidth,
		sourceHeight,
		width: Math.max(1, Math.round(sourceWidth * scale)),
		height: Math.max(1, Math.round(sourceHeight * scale)),
	};
}

function abort(signal) {
	signal?.throwIfAborted();
}

async function animated(file, type) {
	if (type !== "image/png" && type !== "image/webp") return false;
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	const data = new DataView(buffer);
	const text = (offset) =>
		String.fromCharCode(...bytes.subarray(offset, offset + 4));
	const png = type === "image/png";
	let offset = png ? 8 : 12;
	while (offset + 8 <= bytes.length) {
		const size = data.getUint32(offset + (png ? 0 : 4), !png);
		const type = text(offset + (png ? 4 : 0));
		if (type === "acTL" || type === "ANIM" || type === "ANMF") return true;
		offset += png ? size + 12 : size + 8 + (size % 2);
	}
	return false;
}

async function decode(file, view, signal) {
	const url = view.URL.createObjectURL(file);
	const image = new view.Image();
	let onAbort;
	try {
		await new Promise((resolve, reject) => {
			onAbort = () => {
				image.src = "";
				reject(signal.reason);
			};
			image.onload = resolve;
			image.onerror = () =>
				reject(libraryError("DECODE", `Cannot decode ${file.name}`));
			signal?.addEventListener("abort", onAbort, { once: true });
			abort(signal);
			image.src = url;
		});
		return image;
	} catch (cause) {
		abort(signal);
		if (cause?.code === "DECODE") throw cause;
		throw libraryError("DECODE", `Cannot decode ${file.name}`, Error, cause);
	} finally {
		signal?.removeEventListener("abort", onAbort);
		image.onload = null;
		image.onerror = null;
		view.URL.revokeObjectURL(url);
	}
}

async function transform(file, config, { input, signal }) {
	abort(signal);
	if (!config.active) return { file, decision: "not-applicable" };
	const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	abort(signal);
	const sourceType = detectImageType(header) || file.type;
	if (!sourceType.startsWith("image/"))
		return { file, decision: "not-applicable" };
	if (!safeTypes.has(sourceType) || (await animated(file, sourceType))) {
		if (config.mandatory)
			throw libraryError(
				"UNSUPPORTED_FORMAT",
				`Mandatory transformation is unavailable for ${sourceType} (possibly animated)`,
			);
		return { file, decision: "unsupported-original" };
	}
	abort(signal);
	const view = input.ownerDocument.defaultView;
	const source =
		sourceType === file.type
			? file
			: new view.File([file], file.name, {
					type: sourceType,
					lastModified: file.lastModified,
				});
	const image = await decode(source, view, signal);
	let canvas;
	let required = config.mandatory;
	try {
		abort(signal);
		const width = image.naturalWidth;
		const height = image.naturalHeight;
		if (!width || !height)
			throw libraryError("DECODE", "Image has no usable dimensions");
		const geometry = imageGeometry(width, height, config);
		const type = config.format || sourceType;
		const changed =
			geometry.width !== width ||
			geometry.height !== height ||
			geometry.sourceWidth !== width ||
			geometry.sourceHeight !== height ||
			type !== sourceType;
		required = changed || config.reencode;
		if (!required && config.quality === undefined)
			return { file, decision: "already-conforming" };
		canvas = input.ownerDocument.createElement("canvas");
		canvas.width = geometry.width;
		canvas.height = geometry.height;
		const context = canvas.getContext("2d");
		if (!context) throw libraryError("ENCODE", "Canvas 2D is unavailable");
		if (type === "image/jpeg") {
			context.fillStyle = config.background;
			context.fillRect(0, 0, canvas.width, canvas.height);
		}
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(
			image,
			geometry.x,
			geometry.y,
			geometry.sourceWidth,
			geometry.sourceHeight,
			0,
			0,
			geometry.width,
			geometry.height,
		);
		const blob = await new Promise((resolve, reject) => {
			canvas.toBlob(
				(result) =>
					result
						? resolve(result)
						: reject(libraryError("ENCODE", "Image encoding returned no Blob")),
				type,
				config.quality,
			);
		});
		abort(signal);
		if (blob.type !== type)
			throw libraryError(
				"UNSUPPORTED_FORMAT",
				`Browser cannot encode ${type} (returned ${blob.type})`,
			);
		if (!required && blob.size >= file.size)
			return { file, decision: "larger-original" };
		const name =
			blob.type === sourceType
				? file.name
				: `${file.name.replace(/\.[^.]*$/, "")}.${extensions[blob.type]}`;
		return {
			file: new view.File([blob], name, {
				type: blob.type,
				lastModified: file.lastModified,
			}),
			decision: "transformed",
		};
	} catch (error) {
		if (!required && !signal?.aborted)
			return { file, decision: "encoding-failed-original" };
		if (
			signal?.aborted ||
			["DECODE", "ENCODE", "UNSUPPORTED_FORMAT"].includes(error?.code)
		)
			throw error;
		throw libraryError("ENCODE", "Image encoding failed", Error, error);
	} finally {
		image.src = "";
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	}
}

// Used by the EXIF policy after optional image processing. Do not reapply input
// attributes (crop/format/etc.) while only normalizing the remaining orientation.
export function normalizeImage(file, context) {
	return transform(file, parseImageOptions({ reencode: true }), context);
}

/** Explicit image processor. HTML attributes are overridden by factory options. */
export function createImageProcessor(options = {}) {
	// Validate JS configuration before touching any input or installing listeners.
	parseImageOptions(options);
	const processor = async (file, context) =>
		processor.configure(context.input)(file, context);
	processor.configure = (input) => {
		const attributes = {};
		for (const key of ["maxWidth", "maxHeight", "ratio", "quality", "format"]) {
			if (key in input.dataset) attributes[key] = input.dataset[key];
		}
		const config = parseImageOptions({ ...attributes, ...options });
		const configured = async (file, context) => {
			try {
				return await transform(file, config, context);
			} catch (error) {
				if (context.signal?.aborted) throw error;
				if (config.mandatory && config.fallback !== "original") throw error;
				return {
					file,
					decision: config.mandatory
						? "fallback-original"
						: "encoding-failed-original",
				};
			}
		};
		configured.mandatory = config.mandatory;
		return configured;
	};
	return processor;
}
