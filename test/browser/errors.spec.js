import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/test/fixtures/form.html");
	await page.waitForFunction(() => window.api);
});

test("library codes reach the event, entry and readiness rejection", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const results = [];
			const input = document.querySelector("#files");
			for (const options of [{ maxSize: 1 }, { process: () => null }]) {
				const sf = new window.api.Superfile(input, options);
				let detail;
				const listener = (event) => {
					detail = event.detail;
				};
				input.addEventListener("superfile:error", listener);
				try {
					await sf.addFiles([new File(["abc"], "file.txt")]);
				} catch (error) {
					results.push({
						code: error.code,
						same:
							detail.error === error &&
							sf.entries[0].error === error &&
							(await sf.whenReady().catch((reason) => reason === error)),
						files: sf.files.length,
					});
				}
				input.removeEventListener("superfile:error", listener);
				sf.dispose();
			}
			return results;
		}),
	).toEqual([
		{ code: "MAX_SIZE", same: true, files: 0 },
		{ code: "PROCESSOR_RESULT", same: true, files: 0 },
	]);
});

test("application callback errors keep their identity and custom codes", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const { createExifProcessor } = await import("/exif.js");
			const input = document.querySelector("#files");
			const results = [];
			for (const hook of ["configure", "validate", "process", "onMetadata"]) {
				const error = Object.assign(new Error("Application rejection"), {
					code: "BUSINESS_RULE",
				});
				const fail = () => {
					throw error;
				};
				let sf;
				try {
					const process = (file) => file;
					if (hook === "configure") process.configure = fail;
					sf = new window.api.Superfile(
						input,
						hook === "validate"
							? { validate: fail }
							: {
									process:
										hook === "onMetadata"
											? createExifProcessor({
													onMetadata: fail,
													codec: { load() {}, dump() {}, insert() {} },
												})
											: hook === "process"
												? fail
												: process,
								},
					);
					await sf.addFiles([new File(["abc"], "file.txt")]);
				} catch (reason) {
					results.push(reason === error && reason.code === "BUSINESS_RULE");
				} finally {
					sf?.dispose();
				}
			}
			return results;
		}),
	).toEqual([true, true, true, true]);
});

test("native FileList write exceptions have a stable code and original cause", async ({
	page,
}) => {
	expect(
		await page.evaluate(async () => {
			const input = document.querySelector("#files");
			const sf = new window.api.Superfile(input);
			const cause = new DOMException("Write refused", "NotSupportedError");
			Object.defineProperty(input, "files", {
				set() {
					throw cause;
				},
			});
			return sf.addFiles([new File([], "file.txt")]).catch((error) => ({
				code: error.code,
				cause: error.cause === cause,
			}));
		}),
	).toEqual({ code: "FILE_LIST", cause: true });
});
