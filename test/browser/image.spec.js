import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
	await page.evaluate(() => {
		window.makeImage = async (
			type = "image/png",
			width = 400,
			height = 200,
		) => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "red";
			ctx.fillRect(0, 0, width / 4, height);
			ctx.fillStyle = "lime";
			ctx.fillRect(width / 4, 0, width / 2, height);
			ctx.fillStyle = "blue";
			ctx.fillRect((width * 3) / 4, 0, width / 4, height);
			const blob = await new Promise((resolve) => canvas.toBlob(resolve, type));
			return new File(
				[blob],
				type === "image/png" ? "photo.png" : "photo.jpg",
				{ type: blob.type },
			);
		};
		window.inspect = async (file) => {
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
				return {
					width: canvas.width,
					height: canvas.height,
					left: Array.from(
						ctx.getImageData(1, Math.floor(canvas.height / 2), 1, 1).data,
					),
					right: Array.from(
						ctx.getImageData(
							canvas.width - 2,
							Math.floor(canvas.height / 2),
							1,
							1,
						).data,
					),
				};
			} finally {
				URL.revokeObjectURL(url);
			}
		};
	});
});

test("no image options preserves original; resize never enlarges; PDF passes unchanged", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const original = await window.makeImage();
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createImageProcessor(),
			});
			await sf.addFiles([original]);
			const untouched = !sf.entries[0].transformed;
			sf.dispose();
			const next = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createImageProcessor({
					maxWidth: 1000,
					maxHeight: 1000,
				}),
			});
			const pdf = new File(["%PDF"], "document.pdf", {
				type: "application/pdf",
			});
			await next.addFiles([original, pdf]);
			return {
				untouched,
				entries: next.entries.map((entry) => ({
					name: entry.file.name,
					transformed: entry.transformed,
				})),
				dimensions: await window.inspect(next.entries[1].file),
			};
		}),
	).toMatchObject({
		untouched: true,
		entries: [
			{ name: "photo.png", transformed: false },
			{ name: "photo.png", transformed: false },
			{ name: "document.pdf", transformed: false },
		],
		dimensions: { width: 400, height: 200 },
	});
});

test("center crop samples the correct source rectangle before resizing", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const input = document.querySelector("#files");
			input.dataset.ratio = "1:1";
			input.dataset.maxWidth = "80";
			const sf = new window.api.Superfile(input, {
				process: window.api.createImageProcessor(),
			});
			await sf.addFiles([await window.makeImage()]);
			return window.inspect(sf.files[0]);
		}),
	).toEqual({
		width: 80,
		height: 80,
		left: [0, 255, 0, 255],
		right: [0, 255, 0, 255],
	});
});

test("transparent PNG stays transparent; explicit JPEG conversion updates MIME and name", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const canvas = document.createElement("canvas");
			canvas.width = 40;
			canvas.height = 20;
			const blob = await new Promise((resolve) => canvas.toBlob(resolve));
			const file = new File([blob], "transparent.png", { type: "image/png" });
			const input = document.querySelector("#files");
			const sf = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({ maxWidth: 20 }),
			});
			await sf.addFiles([file]);
			const png = await window.inspect(sf.files[0]);
			sf.clear();
			sf.dispose();
			const jpeg = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({
					format: "image/jpeg",
					quality: "85",
				}),
			});
			await jpeg.addFiles([file]);
			return {
				png,
				name: jpeg.files[0].name,
				type: jpeg.files[0].type,
				pixel: (await window.inspect(jpeg.files[0])).left,
			};
		}),
	).toMatchObject({
		png: { width: 20, height: 10, left: [0, 0, 0, 0] },
		name: "transparent.jpg",
		type: "image/jpeg",
		pixel: [255, 255, 255, 255],
	});
});

test("quality 0.85 is passed without truncation and a larger optimization keeps original", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const image = await window.makeImage("image/jpeg");
			let received;
			HTMLCanvasElement.prototype.toBlob = (callback, type, quality) => {
				received = quality;
				callback(new Blob([new Uint8Array(image.size + 100)], { type }));
			};
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createImageProcessor({ quality: "0.85" }),
			});
			await sf.addFiles([image]);
			return {
				received,
				decision: sf.entries[0].decision,
				transformed: sf.entries[0].transformed,
			};
		}),
	).toEqual({
		received: 0.85,
		decision: "larger-original",
		transformed: false,
	});
});

test("an already satisfied dimension constraint does not make quality optimization mandatory", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const image = await window.makeImage();
			HTMLCanvasElement.prototype.toBlob = (callback) => {
				callback(null);
			};
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createImageProcessor({
					maxWidth: 1920,
					quality: 0.85,
				}),
			});
			await sf.addFiles([image]);
			return {
				state: sf.state,
				transformed: sf.entries[0].transformed,
				decision: sf.entries[0].decision,
			};
		}),
	).toEqual({
		state: "ready",
		transformed: false,
		decision: "encoding-failed-original",
	});
});

test("mandatory encode failure blocks, explicit fallback keeps original", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const file = await window.makeImage();
			HTMLCanvasElement.prototype.toBlob = (callback) => {
				callback(null);
			};
			const input = document.querySelector("#files");
			const sf = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({ maxWidth: 20 }),
			});
			let blocked;
			try {
				await sf.addFiles([file]);
			} catch (error) {
				blocked = error.message;
			}
			const count = input.files.length;
			sf.dispose();
			const fallback = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({
					maxWidth: 20,
					fallback: "original",
				}),
			});
			await fallback.addFiles([file]);
			return {
				blocked,
				count,
				state: fallback.state,
				decision: fallback.entries[0].decision,
				transformed: fallback.entries[0].transformed,
			};
		}),
	).toEqual({
		blocked: expect.stringContaining("Blob"),
		count: 0,
		state: "ready",
		decision: "fallback-original",
		transformed: false,
	});
});

test("invalid image decoding rejects mandatory transforms; GIF/SVG remain untouched without constraints", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const input = document.querySelector("#files");
			const sf = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({ maxWidth: 20 }),
			});
			let failed = false;
			try {
				await sf.addFiles([
					new File(["invalid"], "broken.png", { type: "image/png" }),
				]);
			} catch {
				failed = true;
			}
			sf.clear();
			sf.dispose();
			const plain = new window.api.Superfile(input, {
				process: window.api.createImageProcessor({ quality: 0.85 }),
			});
			await plain.addFiles([
				new File(["GIF89a"], "animated.gif", { type: "image/gif" }),
				new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" }),
			]);
			return {
				failed,
				transformed: plain.entries.map((entry) => entry.transformed),
				types: plain.entries.map((entry) => entry.file.type),
			};
		}),
	).toEqual({
		failed: true,
		transformed: [false, false],
		types: ["image/gif", "image/svg+xml"],
	});
});

test("EXIF orientation is applied exactly once before resize", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const original = await window.makeImage("image/jpeg", 80, 40);
			const bytes = new Uint8Array(await original.arrayBuffer());
			// APP1: Exif + little-endian TIFF, one IFD entry Orientation=6 (90° CW).
			const exif = new Uint8Array([
				0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a,
				0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
			]);
			const file = new File(
				[bytes.slice(0, 2), exif, bytes.slice(2)],
				"oriented.jpg",
				{ type: "image/jpeg" },
			);
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: window.api.createImageProcessor({ maxHeight: 40 }),
			});
			await sf.addFiles([file]);
			return window.inspect(sf.files[0]);
		}),
	).toMatchObject({ width: 20, height: 40 });
});

test("native multipart contains actual resized image bytes", async ({
	page,
}) => {
	await page.evaluate(async () => {
		window.sf = new window.api.Superfile(document.querySelector("#files"), {
			process: window.api.createImageProcessor({ maxWidth: 50 }),
		});
		await window.sf.addFiles([await window.makeImage()]);
	});
	await page.locator("#save").click();
	const result = JSON.parse(await page.locator("#result").textContent());
	const file = result.received.find((item) => item.name === "photo.png");
	expect(
		await page.evaluate(async (file) => {
			const bytes = Uint8Array.from(atob(file.base64), (char) =>
				char.charCodeAt(0),
			);
			const blob = new Blob([bytes], { type: file.type });
			const url = URL.createObjectURL(blob);
			const image = new Image();
			image.src = url;
			await image.decode();
			URL.revokeObjectURL(url);
			return [image.naturalWidth, image.naturalHeight];
		}, file),
	).toEqual([50, 25]);
});

test("directory selection passes through with relative paths and refuses transformations", async ({
	page,
}) => {
	await page.evaluate(() => {
		const input = document.querySelector("#files");
		input.setAttribute("webkitdirectory", "");
		window.sf = new window.api.Superfile(input);
	});
	await page.locator("#files").setInputFiles("test/fixtures/directory");
	expect(
		await page.evaluate(async () => {
			await window.sf.whenReady();
			const path = window.sf.files[0].webkitRelativePath;
			let refused = false;
			try {
				window.sf.removeFile(window.sf.entries[0].id);
			} catch {
				refused = true;
			}
			return { path, refused };
		}),
	).toEqual({ path: "directory/nested/file.txt", refused: true });
	await page.evaluate(() => {
		window.sf.clear();
		window.sf.dispose();
		window.sf = new window.api.Superfile(document.querySelector("#files"), {
			process: window.api.createImageProcessor({ maxWidth: 100 }),
		});
	});
	await page.locator("#files").setInputFiles("test/fixtures/directory");
	expect(
		await page.evaluate(async () => {
			try {
				await window.sf.whenReady();
				return "ready";
			} catch {
				return window.sf.state;
			}
		}),
	).toBe("error");
});
