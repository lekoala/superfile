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
