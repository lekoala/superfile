import { expect, test } from "@playwright/test";

test("demo forms, clear controls and manual transport work independently", async ({
	page,
}) => {
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page.locator("#documents").setInputFiles({
		name: "document.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("document"),
	});
	await expect(
		page.locator("#documents-list [data-superfile-name]"),
	).toHaveText("document.txt");
	await page
		.getByRole("button", { name: "Send documents", exact: true })
		.click();
	await expect(
		page.frameLocator('iframe[name="receipt"]').locator("#result"),
	).toContainText("document.txt");
	await page.locator("#documents-form [data-superfile-clear]").click();
	await expect(page.locator("#documents-list")).toBeEmpty();
	await page.locator("#manual").setInputFiles({
		name: "photo.png",
		mimeType: "image/png",
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
			"base64",
		),
	});
	await page.getByRole("button", { name: "Send request", exact: true }).click();
	await expect(page.locator("#response")).toContainText("photo.png");
	expect(errors).toEqual([]);
});

test("demo keeps native input available at mobile width without overflow", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	for (const id of ["documents", "photos", "avatar", "manual"])
		await expect(page.locator(`#${id}`)).toBeVisible();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});
