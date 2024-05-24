/**
 * Superfile
 */

// Global config
const BASE_CLASS = "superfile";
const PREVIEW_CLASS = "superfile-preview";
const PREVIEW_ACTIVE_CLASS = "superfile-preview-active";
const CLEAR_CLASS = "superfile-clear";
const WEBCAM_CLASS = "superfile-webcam";
const READY_CLASS = "superfile-ready";
const DRAG_CLASS = "superfile-drag";
const CLONE_CLASS = "superfile-clone";
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const QUALITY = 1;

class Superfile {
  /**
   * @param {HTMLInputElement} inputElement
   */
  constructor(inputElement) {
    this.inputElement = inputElement;
    this.holderElement = inputElement.parentElement;
    // Look up to two levels
    if (!this.holderElement.classList.contains(BASE_CLASS)) {
      this.holderElement = this.holderElement.parentElement;
    }
    /** @type {HTMLImageElement} */
    this.previewElement = this.holderElement.querySelector("img." + PREVIEW_CLASS);
    /** @type {HTMLButtonElement} */
    this.clearElement = this.holderElement.querySelector("." + CLEAR_CLASS);
    /** @type {HTMLButtonElement} */
    this.webcamElement = this.holderElement.querySelector("." + WEBCAM_CLASS);

    // config
    const data = inputElement.dataset;
    this.disableResize = data.disableResize ? true : false;
    this.maxWidth = data.maxWidth ? parseInt(data.maxWidth) : MAX_WIDTH;
    this.maxHeight = data.maxHeight ? parseInt(data.maxHeight) : MAX_HEIGHT;
    this.hideClear = data.hideClear ? true : false;
    this.imageRatio = data.ratio ? data.ratio.split(/\/|:/) : null;
    this.quality = data.quality ? parseInt(data.quality) : QUALITY;
    if (this.quality > 1) {
      this.quality = this.quality / 100;
    }

    // hide clear if not showing preview
    if (this.clearElement && this.hideClear) {
      this.clearElement.dataset.originalDisplay = this.clearElement.style.display ? this.clearElement.style.display : "block";
      this.clearElement.style.display = "none";
    }

    // if we already have a preview set
    if (this.previewElement && this.previewElement.getAttribute("src")) {
      this.showPreview();
    }

    // listeners
    this.inputElement.addEventListener("change", this);
    if (this.clearElement) {
      this.clearElement.addEventListener("click", this);
    }
    if (this.webcamElement) {
      this.webcamElement.addEventListener("click", this);
    }

    // drag/drop support
    ["dragleave", "dragover", "drop"].forEach((type) => this.holderElement.addEventListener(type, this));

    // ready!
    this.holderElement.classList.add(READY_CLASS);
  }

  dispose() {
    this.inputElement.removeEventListener("change", this);
    if (this.clearElement) {
      this.clearElement.removeEventListener("click", this);
    }
    if (this.webcamElement) {
      this.webcamElement.addEventListener("click", this);
    }
    ["dragleave", "dragover", "drop"].forEach((type) => this.holderElement.removeEventListener(type, this));
  }

  /**
   * Attach to all elements matched by the selector
   * @param {string} selector
   */
  static init(selector = "input[type=file]") {
    let list = document.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
      let el = list[i];
      //@ts-ignore
      let inst = new Superfile(el);
    }
  }

  handleEvent(e) {
    this[`$${e.type}`](e);
  }

  /**
   * This is attached to input element
   * @param {*} e
   */
  $change(e) {
    this.processFiles(() => {
      this.showPreview();
    });
  }

  /**
   * This is attached to clear/webcam element
   * @param {*} e
   */
  $click(e) {
    const btn = e.target.closest("button");
    if (!btn) {
      return;
    }
    if (btn.classList.contains(CLEAR_CLASS)) {
      this.clearPreview();
    }
    if (btn.classList.contains(WEBCAM_CLASS)) {
      this.takePicture();
    }
  }

  /**
   * This is attached to holder element
   * @param {DragEvent} e
   */
  $drop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.inputElement.files = e.dataTransfer.files;
    this.inputElement.dispatchEvent(new Event("change"));
    this.holderElement.classList.remove(DRAG_CLASS);
  }

  /**
   * This is attached to holder element
   * @param {DragEvent} e
   */
  $dragover(e) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.holderElement.classList.contains(DRAG_CLASS)) {
      this.holderElement.classList.add(DRAG_CLASS);
    }
    e.dataTransfer.dropEffect = "copy"; // Explicitly show this is a copy.
  }

  /**
   * This is attached to holder element
   * @param {DragEvent} e
   */
  $dragleave(e) {
    e.stopPropagation();
    e.preventDefault();
    this.holderElement.classList.remove(DRAG_CLASS);
  }

  showPreview() {
    if (!this.previewElement) {
      return;
    }
    this.holderElement.classList.add(PREVIEW_ACTIVE_CLASS);

    // If clear element was hidden, show it
    if (this.clearElement && this.clearElement.dataset.originalDisplay) {
      this.clearElement.style.display = this.clearElement.dataset.originalDisplay;
    }

    // Use data from file input if available
    let previewHolder = this.previewElement.parentElement;
    for (let i = 0; i < this.inputElement.files.length; i++) {
      let file = this.inputElement.files[i];
      if (!file.type.match(/image.*/)) {
        continue;
      }
      /** @type {HTMLImageElement} */
      //@ts-ignore
      let previewEl = previewHolder.querySelectorAll("." + PREVIEW_CLASS)[i];
      if (!previewEl) {
        //@ts-ignore
        previewEl = this.previewElement.cloneNode(true);
        previewEl.classList.add(CLONE_CLASS);
        previewHolder.appendChild(previewEl);
      }
      previewEl.src = URL.createObjectURL(file);
    }
  }

  clearPreview() {
    if (this.previewElement) {
      this.holderElement.classList.remove(PREVIEW_ACTIVE_CLASS);
      this.previewElement.removeAttribute("src");
      if (this.hideClear) {
        this.clearElement.style.display = "none";
      }
      let clones = this.holderElement.querySelectorAll("." + CLONE_CLASS);
      for (let i = 0; i < clones.length; i++) {
        clones[i].parentElement.removeChild(clones[i]);
      }
    }
    this.inputElement.value = null;
  }

  takePicture() {
    const video = document.createElement("video");
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        video.srcObject = stream;
      })
      .catch((err) => {
        console.error(`An error occurred: ${err}`);
      });

    const onCanPlay = (ev) => {
      video.play();
      let zoom = 0.8;
      let width = video.videoWidth;
      let height = video.videoHeight;
      let sw = width;
      let sh = height;
      let currentRatio = width / height;
      let targetRatio = this.getTargetRatio() || currentRatio;

      width *= zoom;
      height *= zoom;

      if (currentRatio > targetRatio) {
        width = height * targetRatio;
      } else if (currentRatio < targetRatio) {
        height = width / targetRatio;
      }
      let sx = (sw - width) / 2;
      let sy = (sh - height) / 2;

      let canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(video, sx, sy, width, height, 0, 0, width, height);
      ctx.canvas.toBlob(
        (blob) => {
          this.createProcessedFile(
            {
              type: "image/jpg",
              name: "webcam",
            },
            blob,
            () => {
              this.showPreview();
              video.removeEventListener("canplay", onCanPlay, false);
              //@ts-ignore
              video.srcObject.getTracks().forEach((track) => track.stop());
              video.remove();
            }
          );
        },
        "image/jpg",
        this.quality
      );
    };

    video.addEventListener("canplay", onCanPlay, false);
  }

  /**
   * @param {File} file
   * @param {HTMLImageElement} img
   * @param {Function} callback
   * @returns {void}
   */
  resizeImage(file, img, callback) {
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;
    let sx = 0;
    let sy = 0;
    let cropWidth = sw;
    let cropHeight = sh;
    let width = sw;
    let height = sh;
    let needResize = width > this.maxWidth || height > this.maxHeight;
    let currentRatio = width / height;
    let targetRatio = this.getTargetRatio() || currentRatio;
    let needCrop = currentRatio !== targetRatio;

    // No resize needed
    if (!needResize && !needCrop) {
      callback();
      return;
    }

    // Crop to ratio
    if (needCrop) {
      if (currentRatio > targetRatio) {
        width = height * targetRatio;
      } else if (currentRatio < targetRatio) {
        height = width / targetRatio;
      }
      sx = (sw - width) / 2;
      sy = (sh - height) / 2;
    }

    // Resize (preserve ratio). Target width/height cannot be above max
    if (width > this.maxWidth) {
      cropWidth *= this.maxWidth / width;
      cropHeight *= this.maxWidth / width;

      height *= this.maxWidth / width;
      width = this.maxWidth;
    }
    if (height > this.maxHeight) {
      cropWidth *= this.maxHeight / height;
      cropHeight *= this.maxHeight / height;

      width *= this.maxHeight / height;
      height = this.maxHeight;
    }

    // Use exact target width
    width = Math.round(width);
    height = Math.round(height);

    // Create a canvas at the target size with the right ratio
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (needCrop) {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropWidth, cropHeight);
    } else {
      ctx.drawImage(img, 0, 0, width, height);
    }

    // @link https://caniuse.com/?search=toblob
    ctx.canvas.toBlob(
      (blob) => {
        this.createProcessedFile(file, blob, callback);
      },
      file.type,
      this.quality
    );
  }

  /**
   * @returns {Number}
   */
  getTargetRatio() {
    if (!this.imageRatio) {
      return 0;
    }
    return parseInt(this.imageRatio[0]) / parseInt(this.imageRatio[1]);
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
        // Maybe the image format is not supported
      };
      //@ts-ignore yes, it's a string
      img.src = ev.target.result;
    };
    reader.onerror = (ev) => {
      console.log(ev);
    };
    reader.readAsDataURL(file);
  }

  /**
   * This will rotate the file and drop exif metadata
   * @param {File|Object} file we use type and name properties
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
    for (let i = 0; i < this.inputElement.files.length; i++) {
      let fileItem = this.inputElement.files[i];
      if (fileItem.name === file.name) {
        container.items.add(resizedFile);
      } else {
        container.items.add(fileItem);
      }
    }
    // It's a new file
    if (!file.lastModified) {
      container.items.add(resizedFile);
    }
    this.inputElement.files = container.files;

    callback();
  }

  /**
   * @param {Function} callback
   */
  processFiles(callback) {
    let files = this.inputElement.files;
    if (!files.length) {
      callback();
      return;
    }
    for (let i = 0; i < files.length; i++) {
      this.handleResizeImage(files[i], callback);
    }
  }
}

export default Superfile;
