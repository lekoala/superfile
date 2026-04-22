/**
 * Superfile EXIF Addon - Extended Superfile with EXIF preservation
 *
 * Extends Superfile to preserve EXIF metadata during image resizing.
 * Uses piexifjs to extract EXIF before resize and re-insert after.
 *
 * @module superfile-exif
 * @extends Superfile
 */

import Superfile from "./superfile.js";

/**
 * Extract GPS coordinates from EXIF object
 * @param {Object} exifObj - EXIF object from piexif.load()
 * @returns {Object|null} - { lat, lon } or null
 */
function extractGPSFromExif(exifObj) {
	if (!exifObj) return null;

	const gpsIfd = exifObj.GPS;
	if (!gpsIfd) return null;

	// piexif will be loaded dynamically
	const piexif = window.piexif;
	if (!piexif) return null;

	const latRef = gpsIfd[piexif.GPSIFD.GPSLatitudeRef];
	const lat = gpsIfd[piexif.GPSIFD.GPSLatitude];
	const lonRef = gpsIfd[piexif.GPSIFD.GPSLongitudeRef];
	const lon = gpsIfd[piexif.GPSIFD.GPSLongitude];

	if (!lat || !lon || !latRef || !lonRef) return null;

	// Convert DMS to decimal
	const latDecimal = convertDMSToDecimal(lat, latRef);
	const lonDecimal = convertDMSToDecimal(lon, lonRef);

	if (latDecimal === null || lonDecimal === null) return null;

	return { lat: latDecimal, lon: lonDecimal };
}

/**
 * Convert DMS (Degrees, Minutes, Seconds) to decimal
 * @param {Array} dms - [degrees, minutes, seconds] as rational arrays
 * @param {string} ref - Direction reference (N, S, E, W)
 * @returns {number|null} - Decimal coordinate
 */
function convertDMSToDecimal(dms, ref) {
	if (!Array.isArray(dms) || dms.length < 3) return null;

	// DMS values are arrays like [numerator, denominator]
	const degrees = dms[0][0] / dms[0][1];
	const minutes = dms[1][0] / dms[1][1];
	const seconds = dms[2][0] / dms[2][1];

	let decimal = degrees + minutes / 60 + seconds / 3600;

	// Negative for South and West
	if (ref === "S" || ref === "W") {
		decimal = -decimal;
	}

	return decimal;
}

/**
 * Format EXIF timestamp for display
 * @param {Object} exifObj - EXIF object
 * @returns {string|null} - Formatted date string
 */
function formatExifTimestamp(exifObj) {
	if (!exifObj?.Exif) return null;

	const piexif = window.piexif;
	if (!piexif) return null;

	const dateTimeOriginal = exifObj.Exif[piexif.ExifIFD.DateTimeOriginal];
	const dateTime = exifObj.Exif[piexif.ExifIFD.DateTime];
	const dateTimeDigitized = exifObj.Exif[piexif.ExifIFD.DateTimeDigitized];

	const dateStr = dateTimeOriginal || dateTime || dateTimeDigitized;
	if (!dateStr) return null;

	// EXIF format: "2024:06:05 19:45:30"
	const parts = dateStr.split(" ");
	if (parts.length === 2) {
		const datePart = parts[0].replace(/:/g, "-");
		const timePart = parts[1];
		return new Date(`${datePart}T${timePart}`).toLocaleString("en-US", {
			month: "long",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	}

	return dateStr;
}

/**
 * SuperfileExif class - Preserves EXIF during image resize
 * @extends Superfile
 */
class SuperfileExif extends Superfile {
	/**
	 * @param {HTMLInputElement} inputElement
	 */
	constructor(inputElement) {
		super(inputElement);
		/** @type {Object|null} */
		this.extractedExif = null;
		/** @type {Object|null} */
		this.extractedGps = null;
		/** @type {string|null} */
		this.formattedTimestamp = null;
	}

	/**
	 * Override handleResizeImage to extract EXIF before processing
	 * @param {File} file
	 * @param {Function} callback
	 */
	handleResizeImage(file, callback) {
		if (!file.type.match(/image.*/) || this.disableResize) {
			super.handleResizeImage(file, callback);
			return;
		}

		// Check if piexif is available
		if (typeof window.piexif === "undefined") {
			console.warn(
				"[SuperfileExif] piexifjs not loaded, falling back to standard processing",
			);
			super.handleResizeImage(file, callback);
			return;
		}

		const reader = new FileReader();
		reader.onload = (ev) => {
			const originalBase64 = ev.target.result;

			// Extract EXIF before any processing
			try {
				const piexif = window.piexif;
				this.extractedExif = piexif.load(originalBase64);
				this.extractedGps = extractGPSFromExif(this.extractedExif);
				this.formattedTimestamp = formatExifTimestamp(this.extractedExif);
			} catch (e) {
				console.warn("[SuperfileExif] Could not extract EXIF:", e);
				this.extractedExif = null;
				this.extractedGps = null;
				this.formattedTimestamp = null;
			}

			// Create image for resizing
			const img = new Image();
			img.onload = () => {
				this.resizeImageWithExif(file, img, originalBase64, callback);
			};
			img.onerror = () => {
				// Fall back to original behavior
				super.handleResizeImage(file, callback);
			};
			img.src = originalBase64;
		};

		reader.onerror = () => {
			super.handleResizeImage(file, callback);
		};

		reader.readAsDataURL(file);
	}

	/**
	 * Resize image and re-insert EXIF
	 * @param {File} file
	 * @param {HTMLImageElement} img
	 * @param {string} originalBase64
	 * @param {Function} callback
	 */
	resizeImageWithExif(file, img, _originalBase64, callback) {
		const sw = img.naturalWidth || img.width;
		const sh = img.naturalHeight || img.height;
		let sx = 0;
		let sy = 0;
		let cropWidth = sw;
		let cropHeight = sh;
		let width = sw;
		let height = sh;
		const needResize = width > this.maxWidth || height > this.maxHeight;
		const currentRatio = width / height;
		const targetRatio = this.getTargetRatio() || currentRatio;
		const needCrop = currentRatio !== targetRatio;

		// No resize needed
		if (!needResize && !needCrop) {
			callback();
			return;
		}

		// Crop to ratio
		if (needCrop) {
			if (currentRatio > targetRatio) {
				width = height * targetRatio;
			} else if (currentRatio < targetRatio) {
				height = width / targetRatio;
			}
			sx = (sw - width) / 2;
			sy = (sh - height) / 2;
		}

		// Resize (preserve ratio)
		if (width > this.maxWidth) {
			cropWidth *= this.maxWidth / width;
			cropHeight *= this.maxWidth / width;
			height *= this.maxWidth / width;
			width = this.maxWidth;
		}
		if (height > this.maxHeight) {
			cropWidth *= this.maxHeight / height;
			cropHeight *= this.maxHeight / height;
			width *= this.maxHeight / height;
			height = this.maxHeight;
		}

		// Round dimensions
		width = Math.round(width);
		height = Math.round(height);

		// Create canvas
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		if (needCrop) {
			ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropWidth, cropHeight);
		} else {
			ctx.drawImage(img, 0, 0, width, height);
		}

		// Convert to blob with EXIF re-insertion
		ctx.canvas.toBlob(
			(blob) => {
				if (this.extractedExif) {
					this.createFileWithExif(file, blob, callback);
				} else {
					// No EXIF to preserve, use standard method
					this.createProcessedFile(file, blob, callback);
				}
			},
			file.type,
			this.quality,
		);
	}

	/**
	 * Create processed file with EXIF re-inserted
	 * @param {File} file
	 * @param {Blob} blob
	 * @param {Function} callback
	 */
	createFileWithExif(file, blob, callback) {
		// Convert blob to base64
		const reader = new FileReader();
		reader.onload = (e) => {
			const resizedBase64 = e.target.result;

			try {
				const piexif = window.piexif;
				// Re-insert EXIF into resized image
				const exifBytes = piexif.dump(this.extractedExif);
				const withExif = piexif.insert(exifBytes, resizedBase64);

				// Convert back to blob and create file
				const base64Data = withExif.split(",")[1];
				const mimeType = file.type;
				const binaryData = atob(base64Data);
				const arrayBuffer = new Uint8Array(binaryData.length);
				for (let i = 0; i < binaryData.length; i++) {
					arrayBuffer[i] = binaryData.charCodeAt(i);
				}

				const newBlob = new Blob([arrayBuffer], { type: mimeType });
				const resizedFile = new File([newBlob], file.name, {
					type: mimeType,
					lastModified: Date.now(),
				});

				// Replace in FileList
				const container = new DataTransfer();
				for (let i = 0; i < this.inputElement.files.length; i++) {
					const fileItem = this.inputElement.files[i];
					if (fileItem.name === file.name) {
						container.items.add(resizedFile);
					} else {
						container.items.add(fileItem);
					}
				}
				this.inputElement.files = container.files;

				callback();
			} catch (e) {
				console.error("[SuperfileExif] Error inserting EXIF:", e);
				// Fall back to file without EXIF
				this.createProcessedFile(file, blob, callback);
			}
		};

		reader.onerror = () => {
			this.createProcessedFile(file, blob, callback);
		};

		reader.readAsDataURL(blob);
	}

	/**
	 * Get extracted EXIF data
	 * @returns {Object|null}
	 */
	getExifData() {
		return {
			exif: this.extractedExif,
			gps: this.extractedGps,
			timestamp: this.formattedTimestamp,
			hasExifGps: !!this.extractedGps,
		};
	}

	/**
	 * Clear extracted EXIF data
	 */
	clearExifData() {
		this.extractedExif = null;
		this.extractedGps = null;
		this.formattedTimestamp = null;
	}

	/**
	 * Clear preview and EXIF data
	 */
	clearPreview() {
		super.clearPreview();
		this.clearExifData();
	}

	/**
	 * Static init method (overrides parent)
	 * @param {string} selector
	 */
	static init(selector = "input[type=file]") {
		const list = document.querySelectorAll(selector);
		for (const el of list) {
			new SuperfileExif(el);
		}
	}
}

export default SuperfileExif;
