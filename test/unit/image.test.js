import { test } from "bun:test";
import { strict as assert } from "node:assert";
import { imageGeometry, parseImageOptions } from "../../src/image.js";

test("quality and ratio parse completely, invalid config is rejected", () => {
	assert.equal(
		parseImageOptions({ quality: "0.85", ratio: "16:9" }).quality,
		0.85,
	);
	assert.equal(parseImageOptions({ quality: 85, ratio: "4/3" }).ratio, 4 / 3);
	for (const options of [
		{ quality: "85px" },
		{ quality: 1.5 },
		{ ratio: "4/0" },
		{ maxWidth: -1 },
		{ maxHeight: "20px" },
		{ quality: "" },
		{ format: "image/gif" },
		{ reencode: "true" },
	])
		assert.throws(() => parseImageOptions(options), {
			name: "TypeError",
			code: "CONFIGURATION",
		});
});

test("crop source rectangle and bounded output are independent", () => {
	assert.deepEqual(imageGeometry(400, 200, { ratio: 1, maxWidth: 100 }), {
		x: 100,
		y: 0,
		sourceWidth: 200,
		sourceHeight: 200,
		width: 100,
		height: 100,
	});
	assert.deepEqual(
		imageGeometry(100, 200, { maxWidth: 1000, maxHeight: 1000 }),
		{
			x: 0,
			y: 0,
			sourceWidth: 100,
			sourceHeight: 200,
			width: 100,
			height: 200,
		},
	);
});
