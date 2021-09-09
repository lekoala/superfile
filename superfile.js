/**
 * Superfile
 */

// Global config
const BASE_CLASS = "superfile";
const PREVIEW_CLASS = "superfile-preview";
const PREVIEW_ACTIVE_CLASS = "superfile-preview-active";
const CLEAR_CLASS = "superfile-clear";
const READY_CLASS = "superfile-ready";
const DRAG_CLASS = "superfile-drag";
const MAX_WIDTH = 1024;
const MAX_HEIGHT = 1024;

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
    this.previewElement = this.holderElement.querySelector("img." + PREVIEW_CLASS);
    this.clearElement = this.holderElement.querySelector("." + CLEAR_CLASS);

    // config
    this.disableResize = inputElement.dataset.disableResize ? true : false;
    this.maxWidth = inputElement.dataset.maxWidth ? parseInt(inputElement.dataset.maxWidth) : MAX_WIDTH;
    this.maxHeight = inputElement.dataset.maxHeight ? parseInt(inputElement.dataset.maxHeight) : MAX_HEIGHT;
    this.hideClear = inputElement.dataset.hideClear ? true : false;
    this.imageRatio = inputElement.dataset.ratio ? inputElement.dataset.ratio.split(/\/|:/) : null;

    if (this.clearElement && this.hideClear) {
      this.clearElement.dataset.originalDisplay = this.clearElement.style.display ? this.clearElement.style.display : "block";
      this.clearElement.style.display = "none";
    }

    // if we already have a preview set
    if (this.previewElement && this.previewElement.getAttribute("src")) {
      this.showPreview();
    }

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

    // drop support
    this.holderElement.addEventListener("dragleave", (ev) => {
      this.onDragleave(ev);
    });
    this.holderElement.addEventListener("dragover", (ev) => {
      this.onDragover(ev);
    });
    this.holderElement.addEventListener("drop", (ev) => {
      this.onDrop(ev);
    });

    // ready!
    this.holderElement.classList.add(READY_CLASS);
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

  /**
   * @param {Event} e
   */
  onDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.inputElement.files = e.dataTransfer.files;
    this.inputElement.dispatchEvent(new Event("change"));
    this.holderElement.classList.remove(DRAG_CLASS);
  }

  /**
   * @param {Event} e
   */
  onDragover(e) {
    e.stopPropagation();
    e.preventDefault();
    if (!this.holderElement.classList.contains(DRAG_CLASS)) {
      this.holderElement.classList.add(DRAG_CLASS);
    }
    e.dataTransfer.dropEffect = "copy"; // Explicitly show this is a copy.
  }

  /**
   * @param {Event} e
   */
  onDragleave(e) {
    e.stopPropagation();
    e.preventDefault();
    this.holderElement.classList.remove(DRAG_CLASS);
  }

  showPreview() {
    if (this.previewElement) {
      this.holderElement.classList.add(PREVIEW_ACTIVE_CLASS);
      if (this.clearElement && this.clearElement.dataset.originalDisplay) {
        this.clearElement.style.display = this.clearElement.dataset.originalDisplay;
      }
      // Use data from file input if available
      if (this.inputElement.files[0]) {
        this.previewElement.src = URL.createObjectURL(this.inputElement.files[0]);
      }
    }
  }

  clearPreview() {
    this.inputElement.value = null;
    if (this.previewElement) {
      this.holderElement.classList.remove(PREVIEW_ACTIVE_CLASS);
      this.previewElement.removeAttribute("src");
      if (this.hideClear) {
        this.clearElement.style.display = "none";
      }
    }
  }

  /**
   * This might not be needed since it seems that the browser
   * already rotates and drops exif anyway
   * @link https://stackoverflow.com/questions/18297120/html5-resize-image-and-keep-exif-in-resized-image
   * @link https://github.com/recurser/exif-orientation-examples
   * @link https://stackoverflow.com/questions/7584794/accessing-jpeg-exif-rotation-data-in-javascript-on-the-client-side/32490603#32490603
   * @param {File} file
   * @param {Function} callback
   */
  /*getOrientation(file, callback) {
    if (file.type !== "image/jpeg") {
      // not jpeg
      return callback(-2);
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var view = new DataView(e.target.result);
      if (view.getUint16(0, false) != 0xffd8) {
        // not jpeg
        return callback(-2);
      }
      var length = view.byteLength,
        offset = 2;
      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) return callback(-1);
        var marker = view.getUint16(offset, false);
        offset += 2;
        if (marker == 0xffe1) {
          if (view.getUint32((offset += 2), false) != 0x45786966) {
            return callback(-1);
          }

          var little = view.getUint16((offset += 6), false) == 0x4949;
          offset += view.getUint32(offset + 4, little);
          var tags = view.getUint16(offset, little);
          offset += 2;
          for (var i = 0; i < tags; i++) {
            if (view.getUint16(offset + i * 12, little) == 0x0112) {
              return callback(view.getUint16(offset + i * 12 + 8, little));
            }
          }
        } else if ((marker & 0xff00) != 0xff00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      // not defined
      return callback(-1);
    };
    reader.readAsArrayBuffer(file);
  }*/

  /**
   * @param {File} file
   * @param {Image} img
   * @param {Function} callback
   * @returns {void}
   */
  resizeImage(file, img, callback) {
    let canvas = document.createElement("canvas");

    let sx = 0;
    let sy = 0;
    let imgWidth = img.naturalWidth;
    let imgHeight = img.naturalHeight;
    let cropWidth = imgWidth;
    let cropHeight = imgHeight;
    let width = imgWidth;
    let height = imgHeight;
    let needResize = width > this.maxWidth || height > this.maxHeight;
    let currentRatio = width / height;
    let targetRatio = currentRatio;
    let needCrop = false;
    if (this.imageRatio) {
      targetRatio = this.imageRatio[0] / this.imageRatio[1];
      needCrop = this.imageRatio !== targetRatio;
    }

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
      sx = (imgWidth - width) / 2;
      sy = (imgHeight - height) / 2;
    }

    // Resize (preserve ratio)
    if (width > this.maxWidth) {
      height *= this.maxWidth / width;
      cropWidth *= this.maxWidth / width;
      cropHeight *= this.maxWidth / width;
      width = this.maxWidth;
    }
    if (height > this.maxHeight) {
      width *= this.maxHeight / height;
      cropWidth *= this.maxHeight / height;
      cropHeight *= this.maxHeight / height;
      height = this.maxHeight;
    }

    width = Math.round(width);
    height = Math.round(height);

    canvas.width = width;
    canvas.height = height;

    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (needCrop) {
      ctx.drawImage(img, sx, sy, imgWidth, imgHeight, 0, 0, cropWidth, cropHeight);
    } else {
      ctx.drawImage(img, 0, 0, width, height);
    }

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
        // Maybe the image format is not supported
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
