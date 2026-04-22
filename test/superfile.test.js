/**
 * @jest-environment jsdom
 */
import "./setup.js";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import Superfile from "../superfile.js";

describe("Superfile", () => {
	let container;

	beforeEach(() => {
		// Reset DOM
		document.body.innerHTML = "";
		container = document.createElement("div");
		container.className = "superfile";
		document.body.appendChild(container);
	});

	describe("constructor", () => {
		it("should initialize with basic file input", () => {
			container.innerHTML = `
				<input type="file" id="file-input" />
			`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.inputElement).toBe(input);
			expect(sf.holderElement).toBe(container);
			expect(container.classList.contains("superfile-ready")).toBe(true);
		});

		it("should find preview element", () => {
			container.innerHTML = `
				<input type="file" id="file-input" />
				<img class="superfile-preview" />
			`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.previewElement).toBe(container.querySelector("img.superfile-preview"));
		});

		it("should find clear button", () => {
			container.innerHTML = `
				<input type="file" id="file-input" />
				<button class="superfile-clear">Clear</button>
			`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.clearElement).toBe(container.querySelector("button.superfile-clear"));
		});

		it("should find webcam button", () => {
			container.innerHTML = `
				<input type="file" id="file-input" />
				<button class="superfile-webcam">Camera</button>
			`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.webcamElement).toBe(container.querySelector("button.superfile-webcam"));
		});
	});

	describe("configuration", () => {
		it("should parse default values", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.disableResize).toBe(false);
			expect(sf.maxWidth).toBe(1920);
			expect(sf.maxHeight).toBe(1920);
			expect(sf.hideClear).toBe(false);
			expect(sf.quality).toBe(1);
			expect(sf.imageRatio).toBe(null);
		});

		it("should parse data-disable-resize", () => {
			container.innerHTML = `<input type="file" data-disable-resize="1" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.disableResize).toBe(true);
		});

		it("should parse data-max-width and data-max-height", () => {
			container.innerHTML = `<input type="file" data-max-width="800" data-max-height="600" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.maxWidth).toBe(800);
			expect(sf.maxHeight).toBe(600);
		});

		it("should parse data-hide-clear", () => {
			container.innerHTML = `<input type="file" data-hide-clear="1" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.hideClear).toBe(true);
		});

		it("should parse data-ratio", () => {
			container.innerHTML = `<input type="file" data-ratio="16:9" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.imageRatio).toEqual(["16", "9"]);
		});

		it("should parse data-ratio with slash separator", () => {
			container.innerHTML = `<input type="file" data-ratio="4/3" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.imageRatio).toEqual(["4", "3"]);
		});

		it("should parse data-quality as integer under 1", () => {
			container.innerHTML = `<input type="file" data-quality="0" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.quality).toBe(0);
		});

		it("should parse data-quality as percentage and convert", () => {
			container.innerHTML = `<input type="file" data-quality="85" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.quality).toBe(0.85);
		});
	});

	describe("getTargetRatio", () => {
		it("should return 0 when no ratio is set", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.getTargetRatio()).toBe(0);
		});

		it("should calculate 1:1 ratio", () => {
			container.innerHTML = `<input type="file" data-ratio="1:1" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.getTargetRatio()).toBe(1);
		});

		it("should calculate 16:9 ratio", () => {
			container.innerHTML = `<input type="file" data-ratio="16:9" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.getTargetRatio()).toBe(16 / 9);
		});

		it("should calculate 4:3 ratio", () => {
			container.innerHTML = `<input type="file" data-ratio="4:3" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);

			expect(sf.getTargetRatio()).toBe(4 / 3);
		});
	});

	describe("event listeners", () => {
		it("should attach change listener to input", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const addEventListenerSpy = mock(() => {});
			input.addEventListener = addEventListenerSpy;

			new Superfile(input);

			expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Object));
		});

		it("should attach click listener to clear button", () => {
			container.innerHTML = `
				<input type="file" />
				<button class="superfile-clear">Clear</button>
			`;
			const input = container.querySelector("input");
			const clearBtn = container.querySelector("button");
			const addEventListenerSpy = mock(() => {});
			clearBtn.addEventListener = addEventListenerSpy;

			new Superfile(input);

			expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Object));
		});

		it("should attach click listener to webcam button", () => {
			container.innerHTML = `
				<input type="file" />
				<button class="superfile-webcam">Camera</button>
			`;
			const input = container.querySelector("input");
			const webcamBtn = container.querySelector("button");
			const addEventListenerSpy = mock(() => {});
			webcamBtn.addEventListener = addEventListenerSpy;

			new Superfile(input);

			expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Object));
		});
	});

	describe("dispose", () => {
		it("should remove change listener from input", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const removeEventListenerSpy = mock(() => {});
			input.removeEventListener = removeEventListenerSpy;

			const sf = new Superfile(input);
			sf.dispose();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Object));
		});

		it("should remove click listener from clear button", () => {
			container.innerHTML = `
				<input type="file" />
				<button class="superfile-clear">Clear</button>
			`;
			const input = container.querySelector("input");
			const clearBtn = container.querySelector("button");
			const removeEventListenerSpy = mock(() => {});
			clearBtn.removeEventListener = removeEventListenerSpy;

			const sf = new Superfile(input);
			sf.dispose();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Object));
		});

		it("should remove click listener from webcam button", () => {
			container.innerHTML = `
				<input type="file" />
				<button class="superfile-webcam">Camera</button>
			`;
			const input = container.querySelector("input");
			const webcamBtn = container.querySelector("button");
			const removeEventListenerSpy = mock(() => {});
			webcamBtn.removeEventListener = removeEventListenerSpy;

			const sf = new Superfile(input);
			sf.dispose();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Object));
		});

		it("should remove drag/drop listeners from holder", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const removeEventListenerSpy = mock(() => {});
			container.removeEventListener = removeEventListenerSpy;

			const sf = new Superfile(input);
			sf.dispose();

			expect(removeEventListenerSpy).toHaveBeenCalledTimes(3);
			expect(removeEventListenerSpy).toHaveBeenCalledWith("dragleave", expect.any(Object));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("dragover", expect.any(Object));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("drop", expect.any(Object));
		});
	});

	describe("static init", () => {
		it("should initialize all matching inputs", () => {
			container.innerHTML = `
				<input type="file" class="test-input" />
				<input type="file" class="test-input" />
				<input type="text" class="test-input" />
			`;

			Superfile.init("input[type=file].test-input");

			// Check that both file inputs have the ready class on their parent
			const fileInputs = container.querySelectorAll("input[type=file]");
			for (const input of fileInputs) {
				expect(input.parentElement.classList.contains("superfile-ready")).toBe(true);
			}
		});
	});

	describe("handleEvent", () => {
		it("should dispatch to $change method on change event", () => {
			container.innerHTML = `<input type="file" />`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);
			const $changeSpy = mock(() => {});
			sf.$change = $changeSpy;

			sf.handleEvent({ type: "change" });

			expect($changeSpy).toHaveBeenCalled();
		});

		it("should dispatch to $click method on click event", () => {
			container.innerHTML = `
				<input type="file" />
				<button class="superfile-clear">Clear</button>
			`;
			const input = container.querySelector("input");
			const sf = new Superfile(input);
			const $clickSpy = mock(() => {});
			sf.$click = $clickSpy;

			sf.handleEvent({ type: "click", target: container.querySelector("button") });

			expect($clickSpy).toHaveBeenCalled();
		});
	});
});
