import { test } from "bun:test";
import { strict as assert } from "node:assert";
import piexif from "piexifjs";
import { createExifProcessor, readExif } from "../../exif.js";
import { inspectExif, removeExifBytes } from "../../src/exif.js";

const input = { dataset: {}, ownerDocument: { defaultView: { File } } };
const context = () => ({ input, signal: new AbortController().signal });
const bytes = (value) => Uint8Array.from(value, (char) => char.charCodeAt(0));
const bare = new Uint8Array([255, 216, 255, 218, 0, 2, 255, 217]);
const makeJPEG = (tags) =>
	bytes(piexif.insert(piexif.dump(tags), "\xff\xd8\xff\xda\0\x02\xff\xd9"));
const tags = (orientation = 1) => ({
	"0th": { 274: orientation, 271: "Camera", 306: "2026:11:06 12:00:00" },
	Exif: { 36867: "2020:01:02 03:04:05" },
	GPS: {
		1: "S",
		2: [
			[50, 1],
			[30, 1],
			[0, 1],
		],
		3: "W",
		4: [
			[4, 1],
			[0, 1],
			[0, 1],
		],
	},
});

test("EXIF errors distinguish configuration, containers, formats and processor results", async () => {
	assert.throws(() => createExifProcessor({ mode: "invalid" }), {
		name: "TypeError",
		code: "CONFIGURATION",
	});
	assert.throws(() => inspectExif(new Uint8Array(), "image/jpeg"), {
		code: "EXIF_CONTAINER",
	});
	assert.throws(() => removeExifBytes(makeJPEG(tags(6)), "image/jpeg"), {
		code: "EXIF_CONTAINER",
	});
	const file = new File([bare], "test.jpg", { type: "image/jpeg" });
	await assert.rejects(
		createExifProcessor({ process: () => null })(file, context()),
		{ name: "TypeError", code: "PROCESSOR_RESULT" },
	);
	const png = new File(
		[new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
		"test.png",
		{ type: "image/png" },
	);
	await assert.rejects(
		createExifProcessor({ mode: "preserve", codec: piexif })(png, context()),
		{ code: "UNSUPPORTED_FORMAT" },
	);
	const applicationError = new Error("codec failure");
	await assert.rejects(
		readExif(new File([makeJPEG(tags())], "test.jpg"), {
			...piexif,
			load() {
				throw applicationError;
			},
		}),
		(error) => error === applicationError && !("code" in error),
	);
});

test("JPEG removal is lossless, removes every EXIF segment and preserves other APP1 data", () => {
	const exif = makeJPEG(tags()).slice(2, -6);
	const xmp = new Uint8Array([255, 225, 0, 5, 88, 77, 80]);
	const source = new Uint8Array([255, 216, ...exif, ...xmp, ...exif, 255, 217]);
	assert.equal(inspectExif(source, "image/jpeg").ranges.length, 2);
	assert.deepEqual(
		removeExifBytes(source, "image/jpeg"),
		new Uint8Array([255, 216, ...xmp, 255, 217]),
	);
});

test("all EXIF orientation values are inspected in both TIFF byte orders", () => {
	for (let value = 1; value <= 8; value++) {
		const source = makeJPEG(tags(value));
		assert.equal(inspectExif(source, "image/jpeg").oriented, value !== 1);
		if (value !== 1)
			assert.throws(() => removeExifBytes(source, "image/jpeg"), /orientation/);
		// Minimal little-endian orientation IFD, independent from piexif's encoder.
		const tiff = new Uint8Array([
			73,
			73,
			42,
			0,
			8,
			0,
			0,
			0,
			1,
			0,
			18,
			1,
			3,
			0,
			1,
			0,
			0,
			0,
			value,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
		]);
		const segment = new Uint8Array([
			255,
			216,
			255,
			225,
			0,
			34,
			69,
			120,
			105,
			102,
			0,
			0,
			...tiff,
			255,
			217,
		]);
		assert.equal(inspectExif(segment, "image/jpeg").oriented, value !== 1);
	}
});

test("PNG eXIf removal preserves remaining chunks byte for byte", () => {
	const tiff = bytes(piexif.dump(tags())).slice(6);
	const chunk = new Uint8Array(tiff.length + 12);
	new DataView(chunk.buffer).setUint32(0, tiff.length);
	chunk.set([101, 88, 73, 102], 4);
	chunk.set(tiff, 8);
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	const end = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
	const source = new Uint8Array([...signature, ...chunk, ...end]);
	assert.deepEqual(
		removeExifBytes(source, "image/png"),
		new Uint8Array([...signature, ...end]),
	);
});

test("WebP removal updates RIFF length and clears only the EXIF feature bit", () => {
	const tiff = bytes(piexif.dump(tags())).slice(6);
	const chunk = new Uint8Array(8 + tiff.length + (tiff.length % 2));
	chunk.set([69, 88, 73, 70]);
	new DataView(chunk.buffer).setUint32(4, tiff.length, true);
	chunk.set(tiff, 8);
	const source = new Uint8Array([
		82,
		73,
		70,
		70,
		0,
		0,
		0,
		0,
		87,
		69,
		66,
		80,
		86,
		80,
		56,
		88,
		10,
		0,
		0,
		0,
		24,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		...chunk,
	]);
	new DataView(source.buffer).setUint32(4, source.length - 8, true);
	const clean = removeExifBytes(source, "image/webp");
	assert.equal(clean.length, 30);
	assert.equal(new DataView(clean.buffer).getUint32(4, true), 22);
	assert.equal(clean[20], 16); // Alpha bit survives.
	assert.equal(inspectExif(clean, "image/webp").ranges.length, 0);
});

test("truncated containers, trailing bytes and malformed orientation fail closed", () => {
	for (const source of [
		new Uint8Array([255, 216, 255, 225, 255, 255, 0, 255, 217]),
		new Uint8Array([...bare, 0]),
		makeJPEG(tags(9)),
		makeJPEG(tags()).slice(0, -1),
	])
		assert.throws(() => removeExifBytes(source, "image/jpeg"));
	assert.throws(() => removeExifBytes(new Uint8Array([137, 80]), "image/png"));
	assert.throws(() => removeExifBytes(new Uint8Array(12), "image/webp"));
});

test("processor removes EXIF despite an original fallback, recognizes mislabeled JPEG and retains file attributes", async () => {
	const original = new File([makeJPEG(tags())], "photo.jpg", {
		type: "application/octet-stream",
		lastModified: 123,
	});
	const processor = createExifProcessor({
		process: (file) => ({ file, decision: "larger-original" }),
	});
	const result = await processor(original, context());
	assert.equal(result.decision, "exif-removed");
	assert.equal(result.file.type, "image/jpeg");
	assert.equal(result.file.lastModified, 123);
	assert.equal(result.file.name, original.name);
	assert.deepEqual(new Uint8Array(await result.file.arrayBuffer()), bare);
});

test("unsupported images block, ordinary documents pass through, cancellation rejects", async () => {
	const process = createExifProcessor();
	await assert.rejects(
		process(
			new File(["GIF89a"], "photo.gif", { type: "image/gif" }),
			context(),
		),
	);
	const pdf = new File(["%PDF"], "document.pdf", { type: "application/pdf" });
	assert.equal((await process(pdf, context())).file, pdf);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(process(pdf, { input, signal: controller.signal }), {
		name: "AbortError",
	});
	assert.equal(process.configure(input).mandatory, true);
});

test("reading metadata keeps EXIF wall time and validates GPS rationals and ranges", async () => {
	const file = (data) =>
		new File([makeJPEG(data)], "photo.jpg", { type: "image/jpeg" });
	const metadata = await readExif(file(tags()), piexif);
	assert.deepEqual(metadata.gps, { lat: -50.5, lon: -4 });
	assert.equal(metadata.timestamp, "2020:01:02 03:04:05");
	for (const lat of [
		[
			[50, 0],
			[0, 1],
			[0, 1],
		],
		[
			[91, 1],
			[0, 1],
			[0, 1],
		],
		[
			[1, 1],
			[60, 1],
			[0, 1],
		],
	]) {
		const data = tags();
		data.GPS[2] = lat;
		assert.equal((await readExif(file(data), piexif)).gps, null);
	}
	assert.equal(
		await readExif(
			new File([bare], "plain.jpg", { type: "image/jpeg" }),
			piexif,
		),
		null,
	);
});

test("preservation defaults to removing GPS, keeps untransformed orientation and does not mix homonyms", async () => {
	for (const preserveGPS of [false, true]) {
		const process = createExifProcessor({
			mode: "preserve",
			codec: piexif,
			preserveGPS,
			onMetadata(metadata) {
				metadata.tags["0th"][271] = "Mutated";
			},
		});
		const results = await Promise.all(
			[3, 6].map(async (value) => {
				const original = new File([makeJPEG(tags(value))], "same.jpg", {
					type: "image/jpeg",
				});
				return readExif((await process(original, context())).file, piexif);
			}),
		);
		assert.deepEqual(
			results.map((data) => data.tags["0th"][274]),
			[3, 6],
		);
		assert.deepEqual(
			results.map((data) => data.tags["0th"][271]),
			["Camera", "Camera"],
		);
		assert.equal(results[0].tags.thumbnail, null);
		assert.equal(!!results[0].gps, preserveGPS);
	}
});

test("metadata callback runs before removal; codec failures block instead of silently losing preservation", async () => {
	const original = new File([makeJPEG(tags())], "photo.jpg", {
		type: "image/jpeg",
	});
	let gps;
	const process = createExifProcessor({
		codec: piexif,
		onMetadata(data) {
			gps = data.gps;
		},
	});
	assert.equal(
		await readExif((await process(original, context())).file, piexif),
		null,
	);
	assert.deepEqual(gps, { lat: -50.5, lon: -4 });
	const broken = createExifProcessor({
		mode: "preserve",
		codec: {
			...piexif,
			dump() {
				throw new Error("codec failed");
			},
		},
	});
	await assert.rejects(broken(original, context()), /codec failed/);
	assert.throws(() => createExifProcessor({ mode: "preserve" }), /codec/);
	assert.throws(() => createExifProcessor({ mode: "sometimes" }));
});
