// Development tooling only: stop the listener on the fixture server's port.
import { execFileSync } from "node:child_process";

const port = 4178;

if (process.platform === "win32") {
	const output = execFileSync("netstat.exe", ["-ano", "-p", "tcp"], {
		encoding: "utf8",
		windowsHide: true,
	});
	const ids = new Set();
	for (const line of output.split(/\r?\n/)) {
		const [protocol, local, , state, id] = line.trim().split(/\s+/);
		if (
			protocol === "TCP" &&
			local.endsWith(`:${port}`) &&
			state === "LISTENING"
		)
			ids.add(id);
	}
	for (const id of ids) {
		execFileSync("taskkill.exe", ["/PID", id, "/F"], {
			stdio: "inherit",
			windowsHide: true,
		});
	}
	if (!ids.size) console.log(`No server listening on port ${port}.`);
} else {
	let output;
	try {
		output = execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], {
			encoding: "utf8",
		});
	} catch (error) {
		// lsof exits with 1 when no listener matches; other errors must surface.
		if (error.status !== 1) throw error;
		output = "";
	}
	const ids = new Set(output.trim().split(/\s+/).filter(Boolean).map(Number));
	for (const id of ids) {
		process.kill(id, "SIGKILL");
		console.log(`Stopped process ${id} on port ${port}.`);
	}
	if (!ids.size) console.log(`No server listening on port ${port}.`);
}
