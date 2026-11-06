import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./test/browser",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : 4,
	reporter: "list",
	use: { baseURL: "http://127.0.0.1:4178", trace: "retain-on-failure" },
	webServer: {
		command: "bun test/server.js",
		url: "http://127.0.0.1:4178/test/fixtures/form.html",
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
});
