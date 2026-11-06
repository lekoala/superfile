// Local contract-test receiver only; never included in the published library.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const escapeHTML = (value) =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url, "http://127.0.0.1:4178");
		if (req.method === "POST") {
			const chunks = [];
			for await (const chunk of req) chunks.push(chunk);
			const request = new Request(url, {
				method: "POST",
				headers: req.headers,
				body: Buffer.concat(chunks),
			});
			const data = await request.formData();
			const received = [];
			for (const [key, value] of data) {
				if (typeof value === "string") received.push({ key, value });
				else
					received.push({
						key,
						name: value.name,
						type: value.type,
						size: value.size,
						base64: Buffer.from(await value.arrayBuffer()).toString("base64"),
					});
			}
			res.writeHead(url.pathname === "/invalid" ? 422 : 200, {
				"Content-Type": "text/html; charset=utf-8",
			});
			res.end(
				`<pre id="result">${escapeHTML(JSON.stringify({ path: url.pathname, received }))}</pre>`,
			);
			return;
		}
		const path = resolve(
			root,
			`.${decodeURIComponent(url.pathname === "/" ? "/demo.html" : url.pathname)}`,
		);
		if (!path.startsWith(root + sep)) {
			res.writeHead(403);
			res.end();
			return;
		}
		const content = await readFile(path);
		const types = {
			".html": "text/html",
			".js": "text/javascript",
			".json": "application/json",
			".png": "image/png",
			".jpg": "image/jpeg",
		};
		res.writeHead(200, {
			"Content-Type": `${types[extname(path)] || "application/octet-stream"}; charset=utf-8`,
			"Cache-Control": "no-store",
		});
		res.end(content);
	} catch {
		res.writeHead(404);
		res.end("Not found");
	}
});
server.listen(4178, "127.0.0.1");
