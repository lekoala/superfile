/**
 * Superfile
 */

// Global config
const BASE_CLASS = "superfile";
const PREVIEW_CLASS = "superfile-preview";
const CLEAR_CLASS = "superfile-clear";
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;

class Superfile {
  /**
   * @param {HTMLInputElement} inputElement
   */
  constructor(inputElement) {
    this.inputElement = inputElement;
    this.parentElement = inputElement.parentElement;
    // Look up to two levels
    if (!this.parentElement.classList.contains(BASE_CLASS)) {
      this.parentElement = this.parentElement.parentElement;
    }
    this.previewElement = this.parentElement.querySelector("img." + PREVIEW_CLASS);
    this.clearElement = this.parentElement.querySelector("." + CLEAR_CLASS);

    // config
    this.disableResize = inputElement.dataset.disableResize ? true : false;
    this.maxWidth = inputElement.dataset.maxWidth ? parseInt(inputElement.dataset.maxWidth) : MAX_WIDTH;
    this.maxHeight = inputElement.dataset.maxHeight ? parseInt(inputElement.dataset.maxHeight) : MAX_HEIGHT;

    // listeners
    this.inputElement.addEventListener("change", (ev) => {
      this.processImage(() => {
        this.showPreview();
      });
    });

    if (this.clearElement) {
      this.clearElement.addEventListener("click", (ev) => {
        this.clearPreview();
      });
    }
  }

  /**
   * Attach to all elements matched by the selector
   * @param {string} selector
   */
  static init(selector = "input[type=file]") {
    let list = document.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
      let el = list[i];
      let inst = new Superfile(el);
    }
  }

  showPreview() {
    if (this.previewElement) {
      this.previewElement.src = URL.createObjectURL(this.inputElement.files[0]);
    }
  }

  clearPreview() {
    this.inputElement.value = null;
    if (this.previewElement) {
      this.previewElement.src = "";
    }
  }

  /**
   * @param {File} file
   * @param {Image} img
   * @param {Function} callback
   * @returns
   */
  resizeImage(file, img, callback) {
    let canvas = document.createElement("canvas");

    let width = img.width;
    let height = img.height;

    // No resize needed
    if (width <= this.maxWidth && height <= this.maxHeight) {
      callback();
      return;
    }

    // Resize
    if (width > this.maxWidth) {
      height *= this.maxWidth / width;
      width = this.maxWidth;
    }
    if (height > this.maxHeight) {
      width *= this.maxHeight / height;
      height = this.maxHeight;
    }

    width = Math.round(width);
    height = Math.round(height);

    canvas.width = width;
    canvas.height = height;

    let ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    // @link https://caniuse.com/?search=toblob
    ctx.canvas.toBlob(
      (blob) => {
        this.createProcessedFile(file, blob, callback);
      },
      file.type,
      1
    );
  }

  /**
   * @param {File} file
   * @param {Function} callback
   */
  handleResizeImage(file, callback) {
    if (!file.type.match(/image.*/)) {
      callback();
      return;
    }
    if (this.disableResize) {
      callback();
      return;
    }

    let reader = new FileReader();

    reader.onload = (ev) => {
      let img = new Image();
      // We need to wait until image is loaded
      // Otherwise size is not set
      img.onload = () => {
        this.resizeImage(file, img, callback);
      };
      img.onerror = (ev) => {
        console.log(ev);
      };
      img.src = ev.target.result;
    };
    reader.onerror = (ev) => {
      console.log(ev);
    };
    reader.readAsDataURL(file);
  }

  /**
   * @param {File} file
   * @param {Blob} blob
   * @param {Function} callback
   */
  createProcessedFile(file, blob, callback) {
    let resizedFile = new File([blob], file.name, {
      type: file.type,
      lastModified: Date.now(),
    });

    // We cannot manipulate the FileList directly
    // @link https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer
    let container = new DataTransfer();
    container.items.add(resizedFile);
    this.inputElement.files = container.files;

    callback();
  }

  /**
   * @param {Function} callback
   */
  processImage(callback) {
    let file = this.inputElement.files[0];
    if (!file) {
      callback();
      return;
    }
    this.handleResizeImage(file, callback);
  }
}

export default Superfile;
