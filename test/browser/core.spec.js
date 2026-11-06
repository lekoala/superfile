import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
});

async function initialize(page, delay = 0) {
	await page.evaluate((delay) => {
		const input = document.querySelector("#files");
		window.sf = new window.api.Superfile(input, {
			process: async (file) => {
				if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
				return new File([`${file.name}-prepared`], file.name, {
					type: file.type,
				});
			},
		});
	}, delay);
}

test("no JavaScript: native multipart and submitter work", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto("/test/fixtures/form.html");
	await expect(page.locator("#files")).toBeVisible();
	await page.locator("#files").setInputFiles({
		name: "original.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("original"),
	});
	await page.locator("#save").click();
	const data = JSON.parse(await page.locator("#result").textContent());
	expect(data.received).toContainEqual(
		expect.objectContaining({
			name: "original.txt",
			base64: Buffer.from("original").toString("base64"),
		}),
	);
	expect(data.received).toContainEqual({ key: "action", value: "save" });
	await context.close();
});

test("explicit initialization, no processor side effects on configuration error", async ({
	page,
}) => {
	expect(
		await page.evaluate(() => {
			const input = document.querySelector("#files");
			input.dataset.maxWidth = "100";
			let message;
			try {
				new window.api.Superfile(input);
			} catch (error) {
				message = error.message;
			}
			delete input.dataset.maxWidth;
			const first = window.api.Superfile.init();
			const second = window.api.Superfile.init();
			return {
				message,
				count: first.length,
				same: first[0] === second[0],
				external: !!window.api.Superfile.get(
					document.querySelector("#external"),
				),
			};
		}),
	).toEqual({
		message: expect.stringContaining("processor"),
		count: 1,
		same: true,
		external: false,
	});
});

test("duplicate names, atomic commit, explicit add and identity removal", async ({
	page,
}) => {
	await initialize(page, 80);
	expect(
		await page.evaluate(async () => {
			let commits = 0;
			const input = window.sf.input;
			const descriptor = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"files",
			);
			Object.defineProperty(input, "files", {
				get() {
					return descriptor.get.call(this);
				},
				set(value) {
					commits++;
					descriptor.set.call(this, value);
				},
			});
			await window.sf.addFiles([
				new File(["a"], "same.txt"),
				new File(["bb"], "same.txt"),
			]);
			const initial = {
				commits,
				length: input.files.length,
				ids: window.sf.entries.map((entry) => entry.id),
			};
			await window.sf.removeFile(initial.ids[0]);
			await window.sf.addFiles([new File(["c"], "third.txt")]);
			return {
				...initial,
				names: Array.from(input.files, (file) => file.name),
				retained: window.sf.entries[0].id === initial.ids[1],
			};
		}),
	).toEqual({
		commits: 1,
		length: 2,
		ids: [expect.any(String), expect.any(String)],
		names: ["same.txt", "third.txt"],
		retained: true,
	});
});

test("native selection replaces; no artificial second change", async ({
	page,
}) => {
	await initialize(page);
	await page.evaluate(() => {
		window.changes = 0;
		window.sf.input.addEventListener("change", () => window.changes++);
	});
	await page.locator("#files").setInputFiles({
		name: "a.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("a"),
	});
	await page.evaluate(() => window.sf.whenReady());
	await page.locator("#files").setInputFiles({
		name: "b.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("b"),
	});
	expect(
		await page.evaluate(async () => {
			await window.sf.whenReady();
			return {
				names: window.sf.entries.map((entry) => entry.file.name),
				changes: window.changes,
			};
		}),
	).toEqual({ names: ["b.txt"], changes: 2 });
});

test("latest generation wins and existing whenReady follows it", async ({
	page,
}) => {
	await initialize(page, 150);
	expect(
		await page.evaluate(async () => {
			const first = window.sf.addFiles([new File(["a"], "a.txt")]);
			await new Promise((resolve) => setTimeout(resolve, 25));
			const transfer = new DataTransfer();
			transfer.items.add(new File(["b"], "b.txt"));
			window.sf.input.files = transfer.files;
			window.sf.input.dispatchEvent(new Event("change", { bubbles: true }));
			const result = await first;
			return {
				resolved: result.map((entry) => entry.file.name),
				actual: Array.from(window.sf.files, (file) => file.name),
			};
		}),
	).toEqual({ resolved: ["b.txt"], actual: ["b.txt"] });
});

test("failure restores committed FileList and blocks submission until successful replacement", async ({
	page,
}) => {
	await page.evaluate(async () => {
		window.submits = 0;
		document.addEventListener("submit", (event) => {
			event.preventDefault();
			window.submits++;
		});
		window.sf = new window.api.Superfile(document.querySelector("#files"), {
			process: async (file) => {
				if (file.name === "bad.txt") throw new Error("bad file");
				return file;
			},
		});
		await window.sf.addFiles([new File(["valid"], "valid.txt")]);
	});
	await page.locator("#files").setInputFiles([
		{ name: "good.txt", mimeType: "text/plain", buffer: Buffer.from("good") },
		{ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") },
	]);
	expect(
		await page.evaluate(async () => {
			let message;
			try {
				await window.sf.whenReady();
			} catch (error) {
				message = error.message;
			}
			document.querySelector("#form").requestSubmit();
			return {
				message,
				files: Array.from(window.sf.files, (file) => file.name),
				state: window.sf.state,
				submits: window.submits,
			};
		}),
	).toEqual({
		message: "bad file",
		files: ["valid.txt"],
		state: "error",
		submits: 0,
	});
	await page.locator("#files").setInputFiles({
		name: "fixed.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("fixed"),
	});
	expect(
		await page.evaluate(async () => {
			await window.sf.whenReady();
			document.querySelector("#form").requestSubmit();
			return window.submits;
		}),
	).toBe(1);
});

test("one coordinator waits for external controls, preserves first submitter and sends prepared bytes", async ({
	page,
}) => {
	await initialize(page, 150);
	await page.evaluate(() => {
		window.external = new window.api.Superfile(
			document.querySelector("#external"),
			{
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 250));
					return new File(["external-prepared"], file.name);
				},
			},
		);
		void window.sf.addFiles([new File(["raw"], "inside.txt")]);
		void window.external.addFiles([new File(["raw"], "outside.txt")]);
		document
			.querySelector("#form")
			.requestSubmit(document.querySelector("#other"));
		document
			.querySelector("#form")
			.requestSubmit(document.querySelector("#save"));
	});
	const data = JSON.parse(await page.locator("#result").textContent());
	expect(data.path).toBe("/alternate");
	expect(data.received).toContainEqual({ key: "action", value: "other" });
	expect(data.received).toContainEqual(
		expect.objectContaining({
			name: "inside.txt",
			base64: Buffer.from("inside.txt-prepared").toString("base64"),
		}),
	);
	expect(data.received).toContainEqual(
		expect.objectContaining({
			name: "outside.txt",
			base64: Buffer.from("external-prepared").toString("base64"),
		}),
	);
});

test("root submit consumers receive only one ready event and real transformed FormData", async ({
	page,
}) => {
	await initialize(page, 80);
	expect(
		await page.evaluate(async () => {
			const seen = [];
			document.addEventListener("submit", (event) => {
				if (event.defaultPrevented) return;
				event.preventDefault();
				seen.push(
					new FormData(event.target, event.submitter).get("files").text(),
				);
			});
			const ready = window.sf.addFiles([new File(["raw"], "sample.txt")]);
			const form = document.querySelector("#form");
			form.requestSubmit(document.querySelector("#save"));
			form.requestSubmit(document.querySelector("#other"));
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return Promise.all(seen);
		}),
	).toEqual(["sample.txt-prepared"]);
});

test("validation is repeated on resume, formnovalidate is preserved", async ({
	page,
}) => {
	await initialize(page, 100);
	expect(
		await page.evaluate(async () => {
			window.submits = 0;
			const form = document.querySelector("#form");
			const title = document.querySelector("#title");
			title.required = true;
			title.value = "valid";
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				window.submits++;
			});
			const ready = window.sf.addFiles([new File(["a"], "a.txt")]);
			form.requestSubmit(document.querySelector("#save"));
			title.value = "";
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 10));
			const blocked = window.submits;
			document.querySelector("#other").formNoValidate = true;
			form.requestSubmit(document.querySelector("#other"));
			return { blocked, allowed: window.submits };
		}),
	).toEqual({ blocked: 0, allowed: 1 });
});

test("reset clears, cancels a queued submit and invalidates all processing", async ({
	page,
}) => {
	await initialize(page, 100);
	expect(
		await page.evaluate(async () => {
			window.submits = 0;
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				window.submits++;
			});
			const waiting = window.sf.addFiles([new File(["a"], "a.txt")]);
			document.querySelector("#form").requestSubmit();
			document.querySelector("#form").reset();
			const result = await waiting;
			await new Promise((resolve) => setTimeout(resolve, 150));
			return {
				length: window.sf.files.length,
				resolved: result.length,
				submits: window.submits,
			};
		}),
	).toEqual({ length: 0, resolved: 0, submits: 0 });
});

test("prevented reset preserves the selection", async ({ page }) => {
	await initialize(page);
	expect(
		await page.evaluate(async () => {
			await window.sf.addFiles([new File(["a"], "a.txt")]);
			const form = document.querySelector("#form");
			form.addEventListener("reset", (event) => event.preventDefault());
			form.reset();
			await Promise.resolve();
			return window.sf.files.length;
		}),
	).toBe(1);
});

test("clear resolves empty; dispose aborts waiters and detaches listeners", async ({
	page,
}) => {
	await initialize(page, 100);
	expect(
		await page.evaluate(async () => {
			const first = window.sf.addFiles([new File(["a"], "a.txt")]);
			window.sf.clear();
			const cleared = (await first).length;
			const next = window.sf
				.addFiles([new File(["b"], "b.txt")])
				.catch((error) => error.name);
			window.sf.dispose();
			window.sf.dispose();
			const aborted = await next;
			const input = document.querySelector("#files");
			const replacement = new window.api.Superfile(input);
			await replacement.addFiles([new File(["c"], "c.txt")]);
			return { cleared, aborted, content: await replacement.files[0].text() };
		}),
	).toEqual({ cleared: 0, aborted: "AbortError", content: "c" });
});

test("drop replaces rather than adds; single input refuses programmatic multiple", async ({
	page,
}) => {
	await initialize(page);
	expect(
		await page.evaluate(async () => {
			await window.sf.addFiles([new File(["a"], "a.txt")]);
			const transfer = new DataTransfer();
			transfer.items.add(new File(["b"], "b.txt"));
			window.sf.input.dispatchEvent(
				new DragEvent("drop", {
					bubbles: true,
					cancelable: true,
					dataTransfer: transfer,
				}),
			);
			await window.sf.whenReady();
			const names = window.sf.entries.map((entry) => entry.file.name);
			window.sf.input.multiple = false;
			let refused = false;
			try {
				window.sf.addFiles([new File([], "c"), new File([], "d")]);
			} catch {
				refused = true;
			}
			return { names, refused };
		}),
	).toEqual({ names: ["b.txt"], refused: true });
});

test("method=dialog can close while files are preparing", async ({ page }) => {
	await initialize(page, 150);
	expect(
		await page.evaluate(async () => {
			const dialog = document.createElement("dialog");
			document.body.append(dialog);
			const form = document.querySelector("#form");
			dialog.append(form);
			form.method = "dialog";
			dialog.showModal();
			const ready = window.sf.addFiles([new File(["a"], "a.txt")]);
			form.requestSubmit(document.querySelector("#save"));
			const closed = !dialog.open;
			await ready;
			return closed;
		}),
	).toBe(true);
});

test("manual transport awaits readiness and handles HTML/422 itself", async ({
	page,
}) => {
	await initialize(page, 50);
	expect(
		await page.evaluate(async () => {
			await window.sf.addFiles([new File(["raw"], "manual.txt")]);
			await window.sf.whenReady();
			const response = await fetch("/invalid", {
				method: "POST",
				body: new FormData(
					document.querySelector("#form"),
					document.querySelector("#save"),
				),
			});
			const html = await response.text();
			const parsed = new DOMParser().parseFromString(html, "text/html");
			return {
				status: response.status,
				data: JSON.parse(parsed.querySelector("#result").textContent),
			};
		}),
	).toMatchObject({
		status: 422,
		data: {
			received: expect.arrayContaining([
				expect.objectContaining({
					name: "manual.txt",
					base64: Buffer.from("manual.txt-prepared").toString("base64"),
				}),
			]),
		},
	});
});
