import { cancelSubmission, syncForm, watchForm } from "./forms.js";

const instances = new WeakMap();
const imageAttributes = ["maxWidth", "maxHeight", "ratio", "quality", "format"];
let nextId = 0;

function entriesFor(files) {
	return Array.from(files, (file) => ({
		id: `file-${++nextId}`,
		original: file,
		file,
		status: "pending",
		transformed: false,
		error: null,
		decision: null,
	}));
}

export default class Superfile {
	constructor(input, options = {}) {
		const view = input?.ownerDocument?.defaultView;
		if (
			!view ||
			!(input instanceof view.HTMLInputElement) ||
			input.type !== "file"
		)
			throw new TypeError("Superfile requires an input[type=file]");
		if (instances.has(input))
			throw new Error("This input already has a Superfile instance");
		if (imageAttributes.some((key) => key in input.dataset) && !options.process)
			throw new TypeError(
				"Image options require an explicit processor from superfile/image",
			);
		if (options.process && typeof options.process !== "function")
			throw new TypeError("process must be a function");
		this._input = input;
		this._process = options.process?.configure
			? options.process.configure(input)
			: options.process;
		if (
			options.maxSize !== undefined &&
			(!Number.isFinite(options.maxSize) || options.maxSize < 0)
		)
			throw new TypeError("maxSize must be a non-negative byte count");
		this._maxSize = options.maxSize;
		this._validate = options.validate;
		if (this._validate && typeof this._validate !== "function")
			throw new TypeError("validate must be a function");
		const zone =
			options.dropTarget ||
			input.closest("[data-superfile-drop], .superfile") ||
			input;
		if (!(zone instanceof view.HTMLElement))
			throw new TypeError("dropTarget must be an HTML element");
		this._entries = [];
		this._committed = [];
		this._validFiles = input.files;
		this._state = "ready";
		this._generation = 0;
		this._waiters = new Set();
		this._tail = Promise.resolve();
		this._disposed = false;
		this._listeners = [];
		const listen = (target, type, handler) => {
			target.addEventListener(type, handler);
			this._listeners.push(() => target.removeEventListener(type, handler));
		};
		listen(input, "change", () => this._start(entriesFor(input.files), true));
		if (zone !== input) {
			for (const button of zone.querySelectorAll("[data-superfile-clear]")) {
				listen(button, "click", (event) => {
					event.preventDefault();
					if (!input.matches(":disabled")) this.clear();
				});
			}
		}
		for (const type of ["dragover", "dragleave", "drop"]) {
			listen(zone, type, (event) => {
				if (input.matches(":disabled") || !event.dataTransfer) return;
				if (type === "dragleave") {
					zone.classList.remove("superfile-drag");
					return;
				}
				if (!Array.from(event.dataTransfer.types).includes("Files")) return;
				event.preventDefault();
				if (type === "dragover") {
					event.dataTransfer.dropEffect = "copy";
					zone.classList.add("superfile-drag");
				} else {
					zone.classList.remove("superfile-drag");
					if (input.hasAttribute("webkitdirectory")) return;
					const files = Array.from(event.dataTransfer.files);
					if (!input.multiple && files.length > 1) files.splice(1);
					this._start(entriesFor(files));
				}
			});
		}
		this._listeners.push(() => zone.classList.remove("superfile-drag"));
		instances.set(input, this);
		this._unwatch = watchForm(this);
		if (input.files.length) this._start(entriesFor(input.files), true);
	}
	static get(input) {
		return instances.get(input);
	}
	static init(selector = "input[type=file][data-superfile]", options = {}) {
		return Array.from(
			document.querySelectorAll(selector),
			(input) => instances.get(input) || new Superfile(input, options),
		);
	}
	get input() {
		return this._input;
	}
	get files() {
		return this._input.files;
	}
	get entries() {
		return this._entries.map((entry) => Object.freeze({ ...entry }));
	}
	get state() {
		return this._state;
	}
	get generation() {
		return this._generation;
	}
	_assertAlive() {
		if (this._disposed)
			throw new DOMException("Superfile has been disposed", "AbortError");
	}
	_emit(type, extra = {}) {
		const view = this.input.ownerDocument.defaultView;
		this.input.dispatchEvent(
			new view.CustomEvent(`superfile:${type}`, {
				bubbles: true,
				detail: {
					generation: this.generation,
					entries: this.entries,
					...extra,
				},
			}),
		);
	}
	_settle(error) {
		for (const waiter of this._waiters) {
			if (error) waiter.reject(error);
			else waiter.resolve(this.entries);
		}
		this._waiters.clear();
	}
	_write(files) {
		const transfer = new this.input.ownerDocument.defaultView.DataTransfer();
		for (const file of files) transfer.items.add(file);
		this.input.files = transfer.files;
		if (this.input.files.length !== files.length)
			throw new Error("This browser cannot replace input.files");
	}
	_start(entries, native = false) {
		this._assertAlive();
		syncForm(this);
		this._controller?.abort();
		const controller = new AbortController();
		this._controller = controller;
		const generation = ++this._generation;
		this._entries = entries.map((entry) => ({
			...entry,
			status: entry.status === "ready" ? "ready" : "pending",
			error: null,
		}));
		this._state = "processing";
		this._error = null;
		this._emit("processing");
		// Serialize across invalidated generations, too, to bound image memory.
		this._tail = this._tail.then(async () => {
			const current = () => !this._disposed && this._generation === generation;
			if (!current()) return;
			let entry;
			try {
				const directory = this.input.hasAttribute("webkitdirectory");
				if (directory && (!native || this._process?.mandatory))
					throw new Error(
						"Directory selections only support native passthrough without mandatory image transforms",
					);
				for (entry of this._entries) {
					if (!current()) return;
					if (entry.status === "ready") continue;
					entry.status = "processing";
					if (
						this._maxSize !== undefined &&
						entry.original.size > this._maxSize
					)
						throw new Error("File exceeds maxSize");
					const context = {
						input: this.input,
						signal: controller.signal,
						generation,
						entry: Object.freeze({ ...entry }),
					};
					await this._validate?.(entry.original, context);
					if (!current()) return;
					const result =
						!directory && this._process
							? await this._process(entry.original, context)
							: entry.original;
					if (!current()) return;
					const file = result?.file || result;
					if (!(file instanceof this.input.ownerDocument.defaultView.File))
						throw new TypeError(
							"A processor must return a File or { file: File }",
						);
					entry.file = file;
					entry.transformed = file !== entry.original;
					entry.decision =
						result?.decision ||
						(entry.transformed ? "transformed" : "original");
					entry.status = "ready";
				}
				if (!current()) return;
				if (!native || this._entries.some((item) => item.transformed))
					this._write(this._entries.map((item) => item.file));
				this._validFiles = this.input.files;
				this._committed = this._entries.map((item) => ({ ...item }));
				this._state = "ready";
				this._settle();
				this._emit("ready", { files: this.files });
			} catch (cause) {
				if (!current()) return;
				const error = cause instanceof Error ? cause : new Error(String(cause));
				if (entry) {
					entry.status = "error";
					entry.error = error;
				}
				this._state = "error";
				this._error = error;
				try {
					this.input.files = this._validFiles;
				} catch {
					this.input.value = "";
				}
				this._settle(error);
				this._emit("error", { id: entry?.id || null, error, blocking: true });
			}
		});
	}
	addFiles(files) {
		this._assertAlive();
		if (this.input.hasAttribute("webkitdirectory"))
			throw new Error("addFiles is unavailable for directory inputs");
		const list = Array.from(files);
		if (
			!list.every(
				(file) => file instanceof this.input.ownerDocument.defaultView.File,
			)
		)
			throw new TypeError("addFiles requires Files");
		if (!this.input.multiple && list.length > 1)
			throw new TypeError("Multiple files require the multiple attribute");
		if (!list.length) return this.whenReady();
		const previous = this._state === "error" ? this._committed : this._entries;
		this._start([
			...(this.input.multiple ? previous : []),
			...entriesFor(list),
		]);
		return this.whenReady();
	}
	removeFile(id) {
		this._assertAlive();
		if (this.input.hasAttribute("webkitdirectory"))
			throw new Error("Individual removal is unavailable for directory inputs");
		if (this.state === "error")
			throw new Error("Clear or select files again to resolve a failed batch");
		if (!this._entries.some((entry) => entry.id === id))
			return this.whenReady();
		this._start(this._entries.filter((entry) => entry.id !== id));
		return this.whenReady();
	}
	clear() {
		this._assertAlive();
		cancelSubmission(this);
		this._controller?.abort();
		++this._generation;
		this.input.value = "";
		this._validFiles = this.input.files;
		this._entries = [];
		this._committed = [];
		this._error = null;
		this._state = "ready";
		this._settle();
		this._emit("cleared");
	}
	whenReady() {
		if (this._disposed)
			return Promise.reject(
				new DOMException("Superfile has been disposed", "AbortError"),
			);
		if (this.state === "error") return Promise.reject(this._error);
		if (this.state === "ready") return Promise.resolve(this.entries);
		return new Promise((resolve, reject) =>
			this._waiters.add({ resolve, reject }),
		);
	}
	dispose() {
		if (this._disposed) return;
		this._disposed = true;
		++this._generation;
		this._controller?.abort();
		this._settle(new DOMException("Superfile has been disposed", "AbortError"));
		this._unwatch();
		for (const remove of this._listeners) remove();
		this._listeners = [];
		instances.delete(this.input);
		if (this.state !== "ready") {
			try {
				this.input.files = this._validFiles;
			} catch {
				this.input.value = "";
			}
		}
		this._emit("disposed");
		this._entries = [];
		this._committed = [];
		this._validFiles = null;
		this._process = null;
		this._validate = null;
		this._controller = null;
		this._unwatch = null;
	}
}
