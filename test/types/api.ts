import Superfile, { type SuperfileEventDetail } from "superfile";
import { createImageProcessor } from "superfile/image";
import { connectPreviews } from "superfile/previews";

const input = document.createElement("input");
const sf = new Superfile(input, {
	process: createImageProcessor({
		maxWidth: 1920,
		quality: "0.85",
		format: "image/webp",
	}),
	async validate(file, { signal }) {
		signal.throwIfAborted();
		if (!file.size) throw new Error("Empty file");
	},
});
const previews = connectPreviews(sf, {
	container: document.createElement("div"),
});
const entries = await sf.addFiles([new File([], "photo.png")]);
if (entries[0]) await sf.removeFile(entries[0].id);
input.addEventListener("superfile:ready", (event) => {
	const detail = (event as CustomEvent<SuperfileEventDetail>).detail;
	console.log(detail.entries[0]?.file.name);
});
previews.dispose();
sf.dispose();
// @ts-expect-error unsupported conversion format
createImageProcessor({ format: "image/gif" });
// @ts-expect-error input must be a native file control
new Superfile(document.createElement("div"));
