import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
});

for (const { method, override } of [
	{ method: "post", override: null },
	{ method: null, override: null },
	{ method: "dialog", override: "" },
	{ method: "dialog", override: "invalid" },
]) {
	test(`a named method control cannot bypass preparation (method=${method}, formmethod=${JSON.stringify(override)})`, async ({
		page,
	}) => {
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		expect(
			await page.evaluate(
				({ method, override }) => {
					const form = document.querySelector("#form");
					if (method === null) form.removeAttribute("method");
					else form.setAttribute("method", method);
					const hidden = document.createElement("input");
					hidden.type = "hidden";
					hidden.name = "method";
					hidden.value = "PUT";
					form.append(hidden);
					const button = document.querySelector("#save");
					if (override !== null) button.setAttribute("formmethod", override);
					let release;
					const gate = new Promise((resolve) => {
						release = resolve;
					});
					window.releaseProcessing = release;
					window.sf = new window.api.Superfile(
						document.querySelector("#files"),
						{
							async process(file) {
								await gate;
								return new File(["prepared bytes"], `${file.name}.prepared`);
							},
						},
					);
					window.submissions = 0;
					window.submitted = new Promise((resolve) => {
						document.addEventListener("submit", async (event) => {
							if (event.defaultPrevented) return;
							event.preventDefault();
							window.submissions++;
							const data = new FormData(form, event.submitter);
							const file = data.get("files");
							resolve({
								name: file.name,
								bytes: await file.text(),
								method: data.get("method"),
							});
						});
					});
					const transfer = new DataTransfer();
					transfer.items.add(new File(["raw bytes"], "a.jpg"));
					window.sf.input.files = transfer.files;
					window.sf.input.dispatchEvent(new Event("change", { bubbles: true }));
					form.requestSubmit(button);
					return {
						shadowed: form.method === hidden,
						submissions: window.submissions,
						rawName: window.sf.files[0].name,
					};
				},
				{ method, override },
			),
		).toEqual({ shadowed: true, submissions: 0, rawName: "a.jpg" });
		expect(
			await page.evaluate(async () => {
				window.releaseProcessing();
				return window.submitted;
			}),
		).toEqual({
			name: "a.jpg.prepared",
			bytes: "prepared bytes",
			method: "PUT",
		});
		expect(await page.evaluate(() => window.submissions)).toBe(1);
		expect(errors).toEqual([]);
	});
}

test("ready listener and queued user intent cannot cause a double submission", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const form = document.querySelector("#form");
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 30));
					return file;
				},
			});
			let submits = 0;
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				submits++;
			});
			sf.input.addEventListener("superfile:ready", () => form.requestSubmit());
			const ready = sf.addFiles([new File(["a"], "a.txt")]);
			form.requestSubmit();
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return submits;
		}),
	).toBe(1);
});

test("queued native intent follows a replacement generation and submits once", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return file;
				},
			});
			const results = [];
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				results.push(Array.from(sf.files, (file) => file.name));
			});
			const ready = sf.addFiles([new File(["a"], "a.txt")]);
			document.querySelector("#form").requestSubmit();
			await new Promise((resolve) => setTimeout(resolve, 10));
			const transfer = new DataTransfer();
			transfer.items.add(new File(["b"], "b.txt"));
			sf.input.files = transfer.files;
			sf.input.dispatchEvent(new Event("change"));
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return results;
		}),
	).toEqual([["b.txt"]]);
});

test("a synchronous form reassignment is guarded before the new form's submit", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const input = document.querySelector("#files");
			const sf = new window.api.Superfile(input, {
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 40));
					return file;
				},
			});
			const next = document.createElement("form");
			next.id = "next";
			document.body.append(next);
			const submissions = [];
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				submissions.push({ id: event.target.id, state: sf.state });
			});
			const ready = sf.addFiles([new File([], "a.txt")]);
			input.setAttribute("form", "next");
			next.requestSubmit();
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return submissions;
		}),
	).toEqual([{ id: "next", state: "ready" }]);
});

test("detaching and later reconnecting a form cancels the old submission intent", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 60));
					return file;
				},
			});
			const form = document.querySelector("#form");
			let submits = 0;
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				submits++;
			});
			const ready = sf.addFiles([new File([], "a.txt")]);
			form.requestSubmit();
			form.remove();
			await new Promise((resolve) => setTimeout(resolve, 5));
			document.body.append(form);
			await ready;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return submits;
		}),
	).toBe(0);
});

test("removal during processing invalidates work and cannot resurrect the removed file", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				process: async (file) => {
					await new Promise((resolve) => setTimeout(resolve, 40));
					return new File(["processed"], file.name);
				},
			});
			const ready = sf.addFiles([new File([], "a.txt"), new File([], "b.txt")]);
			await new Promise((resolve) => setTimeout(resolve, 5));
			await sf.removeFile(sf.entries[0].id);
			await ready;
			return Array.from(sf.files, (file) => file.name);
		}),
	).toEqual(["b.txt"]);
});

test("disabled fields do not block native submit even after a preparation error", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				maxSize: 1,
			});
			try {
				await sf.addFiles([new File(["too large"], "a.txt")]);
			} catch {
				/* expected */
			}
			sf.input.disabled = true;
			let submits = 0;
			document.addEventListener("submit", (event) => {
				event.preventDefault();
				submits++;
			});
			document.querySelector("#form").requestSubmit();
			return submits;
		}),
	).toBe(1);
});

test("async validation rejects the entire batch and reports the offending identity", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"), {
				async validate(file) {
					await Promise.resolve();
					if (file.name.endsWith(".exe")) throw new Error("Not allowed");
				},
			});
			let detail;
			sf.input.addEventListener("superfile:error", (event) => {
				detail = event.detail;
			});
			try {
				await sf.addFiles([new File([], "safe.txt"), new File([], "bad.exe")]);
			} catch {
				/* expected */
			}
			return {
				count: sf.files.length,
				state: sf.state,
				idMatches: detail.id === sf.entries[1].id,
			};
		}),
	).toEqual({ count: 0, state: "error", idMatches: true });
});

test("FileList reconstruction failure restores original committed selection and blocks", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const sf = new window.api.Superfile(document.querySelector("#files"));
			await sf.addFiles([new File([], "valid.txt")]);
			window.DataTransfer = class {
				constructor() {
					throw new Error("DataTransfer unavailable");
				}
			};
			let failed = false;
			try {
				await sf.addFiles([new File([], "new.txt")]);
			} catch {
				failed = true;
			}
			return {
				failed,
				state: sf.state,
				files: Array.from(sf.files, (file) => file.name),
			};
		}),
	).toEqual({ failed: true, state: "error", files: ["valid.txt"] });
});

test("standalone core bundle can select and prepare without optional modules", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const { default: Superfile } = await import("/superfile.min.js");
			const sf = new Superfile(document.querySelector("#files"));
			await sf.addFiles([new File(["untouched"], "file.txt")]);
			return sf.files[0].text();
		}),
	).toBe("untouched");
});
