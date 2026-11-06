import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
	await page.evaluate(() => {
		window.sf = new window.api.Superfile(document.querySelector("#files"));
		window.created = [];
		window.revoked = [];
		const create = URL.createObjectURL.bind(URL);
		const revoke = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = (file) => {
			const url = create(file);
			window.created.push(url);
			return url;
		};
		URL.revokeObjectURL = (url) => {
			window.revoked.push(url);
			revoke(url);
		};
		window.previews = window.api.connectPreviews(window.sf, {
			container: document.querySelector("#previews"),
			image: document.querySelector("#avatar"),
		});
	});
});

test("PDF uses neutral preview; names are text and removal works by keyboard", async ({
	page,
}) => {
	await page.evaluate(() =>
		window.sf.addFiles([
			new File(["%PDF"], "<b>report</b>.pdf", { type: "application/pdf" }),
		]),
	);
	await expect(page.locator("[data-superfile-name]")).toHaveText(
		"<b>report</b>.pdf",
	);
	await expect(page.locator("#previews b")).toHaveCount(0);
	await expect(page.locator("[data-superfile-type]")).toHaveText(
		"application/pdf",
	);
	await expect(page.locator("[data-superfile-thumbnail]")).toBeHidden();
	const button = page.getByRole("button", { name: "Remove <b>report</b>.pdf" });
	await button.focus();
	await page.keyboard.press("Enter");
	await expect(page.locator("#previews [data-superfile-id]")).toHaveCount(0);
	await expect(page.locator("#files")).toBeFocused();
});

test("image URLs are all revoked on replacement, clear and core disposal", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const file = new File(["image"], "photo.png", { type: "image/png" });
			await window.sf.addFiles([file]);
			await window.sf.addFiles([file]);
			window.sf.clear();
			await window.sf.addFiles([file]);
			window.sf.dispose();
			window.previews.dispose();
			return {
				created: window.created.length,
				revoked: window.revoked.length,
				remaining: window.created.filter(
					(url) => !window.revoked.includes(url),
				),
			};
		}),
	).toMatchObject({
		created: expect.any(Number),
		revoked: expect.any(Number),
		remaining: [],
	});
	await expect(page.locator("#previews")).toBeEmpty();
	await expect(page.locator("#avatar")).not.toHaveAttribute("src");
});

test("template binding and adjacent focus after removal", async ({ page }) => {
	await page.evaluate(async () => {
		window.previews.dispose();
		const template = document.createElement("template");
		template.innerHTML =
			'<span data-superfile-name></span><button type="button" data-superfile-remove>Remove file</button>';
		window.previews = window.api.connectPreviews(window.sf, {
			container: document.querySelector("#previews"),
			template,
		});
		await window.sf.addFiles([new File([], "a.pdf"), new File([], "b.pdf")]);
	});
	await page.getByRole("button", { name: "Remove a.pdf", exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("button", { name: "Remove b.pdf", exact: true }),
	).toBeFocused();
});

test("broken thumbnails become neutral rows and release their URLs", async ({
	page,
}) => {
	await page.evaluate(() =>
		window.sf.addFiles([
			new File(["invalid image"], "broken.png", { type: "image/png" }),
		]),
	);
	await expect(page.locator("[data-superfile-thumbnail]")).toBeHidden();
	await expect(page.locator("[data-superfile-thumbnail]")).not.toHaveAttribute(
		"src",
	);
	await expect(page.locator("#avatar")).toBeHidden();
	await expect(page.locator("#avatar")).not.toHaveAttribute("src");
	await expect(page.locator("[data-superfile-name]")).toHaveText("broken.png");
	expect(
		await page.evaluate(() => ({
			remaining: window.created.filter((url) => !window.revoked.includes(url)),
			duplicateRevocations:
				window.revoked.length - new Set(window.revoked).size,
		})),
	).toEqual({ remaining: [], duplicateRevocations: 0 });
	await page.getByRole("button", { name: "Remove broken.png" }).click();
	await expect(page.locator("#previews")).toBeEmpty();
});

test("French labels and formatters cover preparation, prepared files and errors", async ({
	page,
}) => {
	await page.evaluate(() => {
		window.previews.dispose();
		window.sf.dispose();
		window.sf = new window.api.Superfile(document.querySelector("#files"), {
			maxSize: 10,
			process: () =>
				new Promise((resolve) => {
					window.finish = () =>
						resolve(new File(["ok"], "préparé.txt", { type: "text/plain" }));
				}),
		});
		window.previews = window.api.connectPreviews(window.sf, {
			container: document.querySelector("#previews"),
			labels: {
				preparing: "Préparation…",
				error: "Échec de la préparation.",
				remove: "Supprimer",
				removeLabel: (file) => `Supprimer ${file.name}`,
			},
			formatSize: (bytes) => `${bytes} octets`,
			formatError: (error, entry) =>
				`${entry.file.name} : ${error.code === "MAX_SIZE" ? "Fichier trop volumineux" : error.message}`,
		});
		window.pending = window.sf.addFiles([new File(["source"], "original.txt")]);
	});
	await expect(page.getByRole("status")).toHaveText("Préparation…");
	await page.waitForFunction(() => window.finish);
	await page.evaluate(async () => {
		window.finish();
		await window.pending;
	});
	await expect(page.locator("[data-superfile-name]")).toHaveText("préparé.txt");
	await expect(page.locator("[data-superfile-size]")).toHaveText(
		"6 octets → 2 octets",
	);
	await expect(
		page.getByRole("button", { name: "Supprimer préparé.txt" }),
	).toHaveText("Supprimer");
	await page.evaluate(() =>
		window.sf
			.addFiles([new File(["12345678901"], "grand.txt")])
			.catch(() => {}),
	);
	await expect(page.getByRole("status")).toHaveText("Échec de la préparation.");
	await expect(page.locator("[data-superfile-error]").last()).toHaveText(
		"grand.txt : Fichier trop volumineux",
	);
});

test("obsolete thumbnail errors cannot hide a replacement avatar", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			await window.sf.addFiles([
				new File(["broken"], "a.png", { type: "image/png" }),
			]);
			const oldRow = document.querySelector("[data-superfile-thumbnail]");
			window.sf.clear();
			await window.sf.addFiles([
				new File(["broken"], "b.png", { type: "image/png" }),
			]);
			const avatar = document.querySelector("#avatar");
			const url = avatar.getAttribute("src");
			oldRow.dispatchEvent(new Event("error"));
			return {
				same: avatar.getAttribute("src") === url,
				hidden: avatar.hidden,
			};
		}),
	).toEqual({ same: true, hidden: false });
});
