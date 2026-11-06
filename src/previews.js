import { configurationError } from "./errors.js";

function formatBytes(bytes) {
	const units = ["B", "kB", "MB", "GB", "TB", "PB"];
	let unit = 0;
	while (bytes >= 1000 && unit < units.length - 1) {
		bytes /= 1000;
		unit++;
	}
	return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes)} ${units[unit]}`;
}

/**
 * Optional, transport-independent previews. No styles or markup required by core.
 * @param {import("../superfile.js").default} sf
 * @param {Partial<import("../previews.js").PreviewOptions>} [options]
 */
export function connectPreviews(
	sf,
	{
		container,
		template,
		image,
		status,
		labels = {},
		formatSize = formatBytes,
		formatError = (error) => error.message,
	} = {},
) {
	if (!container)
		throw configurationError("connectPreviews requires a container");
	const doc = container.ownerDocument;
	if (template && template.tagName !== "TEMPLATE")
		throw configurationError("template must be an HTMLTemplateElement");
	const urls = new Set();
	const thumbnails = new Map();
	let disposed = false;
	const live = status || doc.createElement("span");
	if (!status) {
		live.setAttribute("role", "status");
		live.setAttribute("aria-live", "polite");
		container.before(live);
	}
	const release = () => {
		for (const [element, cleanup] of thumbnails) {
			cleanup();
			element.removeAttribute("src");
			element.hidden = true;
		}
		thumbnails.clear();
		for (const url of urls) doc.defaultView.URL.revokeObjectURL(url);
		urls.clear();
		if (image) {
			image.removeAttribute("src");
			image.hidden = true;
		}
	};
	const thumbnail = (element, file) => {
		// SVG and unknown images use a neutral row. No executable HTML from names.
		if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
			element.hidden = true;
			return;
		}
		const url = doc.defaultView.URL.createObjectURL(file);
		urls.add(url);
		const cleanup = () => element.removeEventListener("error", onError);
		const onError = () => {
			cleanup();
			thumbnails.delete(element);
			element.hidden = true;
			element.removeAttribute("src");
			if (urls.delete(url)) doc.defaultView.URL.revokeObjectURL(url);
		};
		thumbnails.set(element, cleanup);
		element.addEventListener("error", onError);
		element.src = url;
		element.alt = file.name;
		element.hidden = false;
	};
	const render = () => {
		if (disposed) return;
		const focused = container.contains(doc.activeElement)
			? doc.activeElement.closest("[data-superfile-id]")
			: null;
		const previousIds = Array.from(
			container.querySelectorAll("[data-superfile-id]"),
			(row) => row.getAttribute("data-superfile-id"),
		);
		const focusIndex = focused
			? previousIds.indexOf(focused.getAttribute("data-superfile-id"))
			: -1;
		release();
		container.replaceChildren();
		container.setAttribute("aria-busy", String(sf.state === "processing"));
		live.textContent =
			sf.state === "processing"
				? (labels.preparing ?? "Preparing files…")
				: sf.state === "error"
					? (labels.error ??
						"File preparation failed. Select files again or clear the field.")
					: "";
		const entries = sf.entries;
		if (image && entries[0]) thumbnail(image, entries[0].file);
		for (const entry of entries) {
			const row = doc.createElement("div");
			row.dataset.superfileId = entry.id;
			if (template) row.append(template.content.cloneNode(true));
			else {
				row.innerHTML =
					'<img data-superfile-thumbnail width="64" height="64"><span data-superfile-name></span> <span data-superfile-size></span> <span data-superfile-type></span> <span data-superfile-error></span> <button type="button" data-superfile-remove>Remove</button>';
			}
			const text = (selector, value) => {
				for (const element of row.querySelectorAll(selector))
					element.textContent = value;
			};
			text("[data-superfile-name]", entry.file.name);
			text(
				"[data-superfile-size]",
				entry.transformed
					? `${formatSize(entry.original.size)} → ${formatSize(entry.file.size)}`
					: formatSize(entry.file.size),
			);
			text("[data-superfile-type]", entry.file.type);
			text(
				"[data-superfile-error]",
				entry.error ? formatError(entry.error, entry) : "",
			);
			for (const element of row.querySelectorAll("[data-superfile-thumbnail]"))
				thumbnail(element, entry.file);
			for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (
				row.querySelectorAll("[data-superfile-remove]")
			)) {
				button.setAttribute("type", "button");
				if (labels.remove !== undefined) button.textContent = labels.remove;
				button.setAttribute(
					"aria-label",
					labels.removeLabel
						? labels.removeLabel(entry.file)
						: `Remove ${entry.file.name}`,
				);
				button.disabled =
					sf.input.hasAttribute("webkitdirectory") || sf.state === "error";
			}
			container.append(row);
		}
		if (focusIndex >= 0) {
			const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (
				container.querySelectorAll("[data-superfile-remove]")
			);
			(buttons[Math.min(focusIndex, buttons.length - 1)] || sf.input).focus();
		}
	};
	const remove = (event) => {
		const button = event.target.closest("[data-superfile-remove]");
		if (!button || !container.contains(button) || button.disabled) return;
		const row = button.closest("[data-superfile-id]");
		if (row)
			sf.removeFile(row.dataset.superfileId).catch(() => {
				/* Error is rendered by the error event. */
			});
	};
	const events = ["processing", "ready", "error", "cleared"];
	for (const type of events)
		sf.input.addEventListener(`superfile:${type}`, render);
	container.addEventListener("click", remove);
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		release();
		for (const type of events)
			sf.input.removeEventListener(`superfile:${type}`, render);
		sf.input.removeEventListener("superfile:disposed", dispose);
		container.removeEventListener("click", remove);
		container.replaceChildren();
		container.removeAttribute("aria-busy");
		live.textContent = "";
		if (!status) live.remove();
	};
	sf.input.addEventListener("superfile:disposed", dispose);
	render();
	return { dispose };
}
