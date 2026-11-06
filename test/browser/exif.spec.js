import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
	await page.addScriptTag({ url: "/node_modules/piexifjs/piexif.js" });
	await page.evaluate(async () => {
		Object.assign(window.api, await import("/exif.js"));
		window.inspectExifBytes = (await import("/src/exif.js")).inspectExif;
		window.makeExifJPEG = async (orientation = 1) => {
			const canvas = document.createElement("canvas");
			canvas.width = 80;
			canvas.height = 40;
			const ctx = canvas.getContext("2d");
			for (const [index, color] of [
				"red",
				"lime",
				"blue",
				"yellow",
			].entries()) {
				ctx.fillStyle = color;
				ctx.fillRect((index % 2) * 40, Math.floor(index / 2) * 20, 40, 20);
			}
			const data = canvas.toDataURL("image/jpeg", 0.95);
			const raw = atob(data.split(",")[1]);
			const tags = {
				"0th": { 274: orientation, 271: "Camera" },
				Exif: { 36867: "2020:01:02 03:04:05", 40962: 80, 40963: 40 },
				GPS: {
					1: "N",
					2: [
						[50, 1],
						[0, 1],
						[0, 1],
					],
					3: "E",
					4: [
						[4, 1],
						[0, 1],
						[0, 1],
					],
				},
				"1st": {},
				thumbnail: raw,
			};
			const withExif = window.piexif.insert(window.piexif.dump(tags), raw);
			return {
				file: new File(
					[Uint8Array.from(withExif, (char) => char.charCodeAt(0))],
					"photo.jpg",
					{ type: "image/jpeg", lastModified: 123 },
				),
				plain: Uint8Array.from(raw, (char) => char.charCodeAt(0)),
			};
		};
		window.imagePixels = async (file) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			try {
				img.src = url;
				await img.decode();
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0);
				const palette = [
					[255, 0, 0],
					[0, 255, 0],
					[0, 0, 255],
					[255, 255, 0],
				];
				const corners = [
					[0.25, 0.25],
					[0.75, 0.25],
					[0.25, 0.75],
					[0.75, 0.75],
				].map(([x, y]) => {
					const pixel = ctx.getImageData(
						Math.floor(x * canvas.width),
						Math.floor(y * canvas.height),
						1,
						1,
					).data;
					const distances = palette.map((color) =>
						color.reduce(
							(sum, channel, i) => sum + (channel - pixel[i]) ** 2,
							0,
						),
					);
					return distances.indexOf(Math.min(...distances));
				});
				return { width: canvas.width, height: canvas.height, corners };
			} finally {
				URL.revokeObjectURL(url);
			}
		};
	});
});

for (const resize of [false, true]) {
	test(`EXIF removal keeps the pixels correctly oriented for all eight orientations (resize=${resize})`, async ({
		page,
	}) => {
		const results = await page.evaluate(async (resize) => {
			const results = [];
			for (let orientation = 1; orientation <= 8; orientation++) {
				const { file } = await window.makeExifJPEG(orientation);
				const sf = new window.api.Superfile(document.querySelector("#files"), {
					process: window.api.createExifProcessor({
						process: resize
							? window.api.createImageProcessor({ maxWidth: 40, maxHeight: 40 })
							: undefined,
					}),
				});
				await sf.addFiles([file]);
				const output = sf.files[0];
				results.push({
					...(await window.imagePixels(output)),
					blocks: window.inspectExifBytes(
						new Uint8Array(await output.arrayBuffer()),
						output.type,
					).ranges.length,
				});
				sf.clear();
				sf.dispose();
			}
			return results;
		}, resize);
		const corners = [
			[0, 1, 2, 3],
			[1, 0, 3, 2],
			[3, 2, 1, 0],
			[2, 3, 0, 1],
			[0, 2, 1, 3],
			[2, 0, 3, 1],
			[3, 1, 2, 0],
			[1, 3, 0, 2],
		];
		for (let i = 0; i < 8; i++) {
			const swapped = i >= 4;
			expect(results[i]).toEqual({
				width: swapped ? (resize ? 20 : 40) : resize ? 40 : 80,
				height: swapped ? (resize ? 40 : 80) : resize ? 20 : 40,
				corners: corners[i],
				blocks: 0,
			});
		}
	});
}

test("already conforming and fallback originals are stripped without recompression", async ({
	page,
}) => {
	const results = await page.evaluate(async () => {
		const results = [];
		for (const fallback of [false, true]) {
			const { file, plain } = await window.makeExifJPEG();
			const image = fallback
				? window.api.createImageProcessor({
						format: "image/webp",
						fallback: "original",
					})
				: window.api.createImageProcessor({ maxWidth: 1920 });
			const toBlob = HTMLCanvasElement.prototype.toBlob;
			if (fallback)
				HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createExifProcessor({ process: image }),
			});
			try {
				await sf.addFiles([file]);
				const output = sf.files[0];
				const bytes = new Uint8Array(await output.arrayBuffer());
				results.push({
					identical:
						bytes.length === plain.length &&
						bytes.every((byte, i) => byte === plain[i]),
					modified: output.lastModified,
					decision: sf.entries[0].decision,
				});
			} finally {
				HTMLCanvasElement.prototype.toBlob = toBlob;
				sf.clear();
				sf.dispose();
			}
		}
		return results;
	});
	expect(results).toEqual(
		Array(2).fill({ identical: true, modified: 123, decision: "exif-removed" }),
	);
});

test("the EXIF wrapper's default processor honors image attributes", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { file } = await window.makeExifJPEG(6);
		const input = document.querySelector("#files");
		input.dataset.maxHeight = "40";
		const sf = new window.api.Superfile(input, {
			process: window.api.createExifProcessor(),
		});
		await sf.addFiles([file]);
		return {
			...(await window.imagePixels(sf.files[0])),
			metadata: await window.api.readExif(sf.files[0], window.piexif),
		};
	});
	expect(result).toEqual({
		width: 20,
		height: 40,
		corners: [2, 0, 3, 1],
		metadata: null,
	});
});

test("preservation updates dimensions and orientation, removes obsolete thumbnail, and requires GPS opt-in", async ({
	page,
}) => {
	const results = await page.evaluate(async () => {
		const results = [];
		for (const preserveGPS of [false, true]) {
			const { file } = await window.makeExifJPEG(6);
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createExifProcessor({
					mode: "preserve",
					codec: window.piexif,
					preserveGPS,
					process: window.api.createImageProcessor({ maxHeight: 40 }),
				}),
			});
			await sf.addFiles([file]);
			const metadata = await window.api.readExif(sf.files[0], window.piexif);
			results.push({
				...(await window.imagePixels(sf.files[0])),
				orientation: metadata.tags["0th"][274],
				dimensions: [
					metadata.tags["0th"][256],
					metadata.tags["0th"][257],
					metadata.tags.Exif[40962],
					metadata.tags.Exif[40963],
				],
				thumbnail: metadata.tags.thumbnail,
				gps: metadata.gps,
				timestamp: metadata.timestamp,
			});
			sf.clear();
			sf.dispose();
		}
		return results;
	});
	for (const [i, result] of results.entries())
		expect(result).toEqual({
			width: 20,
			height: 40,
			corners: [2, 0, 3, 1],
			orientation: 1,
			dimensions: [20, 40, 20, 40],
			thumbnail: null,
			gps: i ? { lat: 50, lon: 4 } : null,
			timestamp: "2020:01:02 03:04:05",
		});
});

test("orientation normalization failure blocks even when the wrapped image processor permits fallback", async ({
	page,
}) => {
	const result = await page.evaluate(async () => {
		const { file } = await window.makeExifJPEG(6);
		const sf = new window.api.Superfile(document.querySelector("#files"), {
			process: window.api.createExifProcessor({
				process: window.api.createImageProcessor({
					maxWidth: 1920,
					fallback: "original",
				}),
			}),
		});
		const toBlob = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
		try {
			let rejected = false;
			try {
				await sf.addFiles([file]);
			} catch {
				rejected = true;
			}
			return { rejected, state: sf.state, count: sf.files.length };
		} finally {
			HTMLCanvasElement.prototype.toBlob = toBlob;
			sf.clear();
			sf.dispose();
		}
	});
	expect(result).toEqual({ rejected: true, state: "error", count: 0 });
});

test("PNG and WebP EXIF containers are removed from actual browser images without changing pixels", async ({
	page,
}) => {
	const results = await page.evaluate(async () => {
		const results = [];
		const tiff = Uint8Array.from(
			window.piexif.dump({ "0th": { 274: 1 }, Exif: {}, GPS: {} }).slice(6),
			(char) => char.charCodeAt(0),
		);
		for (const type of ["image/png", "image/webp"]) {
			const canvas = document.createElement("canvas");
			canvas.width = 80;
			canvas.height = 40;
			canvas.getContext("2d").fillRect(0, 0, 80, 40);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
			if (blob.type !== type) throw new Error(`Encoder unavailable: ${type}`);
			const plain = new Uint8Array(await blob.arrayBuffer());
			let source;
			let expected = plain;
			if (type === "image/png") {
				const chunk = new Uint8Array(tiff.length + 12);
				const view = new DataView(chunk.buffer);
				view.setUint32(0, tiff.length);
				chunk.set([101, 88, 73, 102], 4);
				chunk.set(tiff, 8);
				let crc = 0xffffffff;
				for (const byte of chunk.subarray(4, -4)) {
					crc ^= byte;
					for (let bit = 0; bit < 8; bit++)
						crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
				}
				view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
				source = new Uint8Array([
					...plain.slice(0, 33),
					...chunk,
					...plain.slice(33),
				]);
			} else {
				// Some encoders already emit VP8X (e.g. with an ICC profile).
				const vp8x = new Uint8Array([
					86, 80, 56, 88, 10, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 39, 0, 0,
				]);
				expected =
					String.fromCharCode(...plain.slice(12, 16)) === "VP8X"
						? plain.slice()
						: new Uint8Array([
								...plain.slice(0, 12),
								...vp8x,
								...plain.slice(12),
							]);
				new DataView(expected.buffer).setUint32(4, expected.length - 8, true);
				const chunk = new Uint8Array(8 + tiff.length + (tiff.length % 2));
				chunk.set([69, 88, 73, 70]);
				new DataView(chunk.buffer).setUint32(4, tiff.length, true);
				chunk.set(tiff, 8);
				source = new Uint8Array([...expected, ...chunk]);
				source[20] |= 8;
				new DataView(source.buffer).setUint32(4, source.length - 8, true);
			}
			const original = new File([source], "photo", { type });
			const before = await window.imagePixels(original);
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createExifProcessor(),
			});
			await sf.addFiles([original]);
			const file = sf.files[0];
			const clean = new Uint8Array(await file.arrayBuffer());
			results.push({
				before,
				after: await window.imagePixels(file),
				blocks: window.inspectExifBytes(clean, type).ranges.length,
				unchangedPayload:
					clean.length === expected.length &&
					clean.every((byte, i) => byte === expected[i]),
			});
			sf.clear();
			sf.dispose();
		}
		return results;
	});
	for (const result of results) {
		expect(result.after).toEqual(result.before);
		expect(result.blocks).toBe(0);
		expect(result.unchangedPayload).toBe(true);
	}
});
