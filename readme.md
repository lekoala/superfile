# superfile

[![NPM](https://nodei.co/npm/superfile.png?mini=true)](https://nodei.co/npm/superfile/)
[![Downloads](https://img.shields.io/npm/dt/superfile.svg)](https://www.npmjs.com/package/superfile)

An ES6 class to improve file uploads. Works great with Bootstrap but works with any input.

- Resize images on client side to avoid large uploads
- Preview images before upload
- Clear uploads with a button
- Crop to aspect ratio from center
- Drag & drop file support
- Multiple/directory upload support
- Take pictures from the webcam
- **Zero dependencies** - ~450 lines of pure ES6

## Quick Start

```bash
npm install superfile
```

```html
<div class="superfile">
  <input type="file" accept="image/*" data-max-width="1920" />
  <img class="superfile-preview" />
  <button class="superfile-clear">Clear</button>
</div>
```

```javascript
import Superfile from "superfile";
Superfile.init();
```

## Documentation

Full documentation is available in the [docs](./docs) folder:

- [Getting Started](./docs/README.md) - Overview and quick start
- [Configuration](./docs/CONFIGURATION.md) - All data attributes and options
- [API Reference](./docs/API.md) - JavaScript methods and properties
- [EXIF Addon](./docs/EXIF.md) - Preserve metadata during resize
- [Extending](./docs/EXTENDING.md) - Create your own addons

## How to use

```js
import Superfile from "./superfile.js";
Superfile.init();
```

Create a file input. It needs to be wrapped by a div with the `superfile` class.

You can add a clear button and a preview image if you want.

```html
<div class="mb-3 superfile">
  <label for="formFile" class="form-label">Default file input example</label>
  <div class="input-group">
    <input class="form-control" type="file" id="formFile" name="file" />
    <button class="btn btn-outline-secondary superfile-clear" type="button">Clear</button>
  </div>
  <img class="img-fluid superfile-preview" />
</div>
```

## Available options

These are set through `data` attributes:

- disable-resize: don't try to resize the images and keep original files
- max-width: the maximum width of the image (keep ratio)
- max-height: the maximum height of the image (keep ratio)
- hide-clear: hide clear element (if any) until preview is showed
- ratio: set a ratio (eg: 1:1 for a square ratio) for the image. Image is cropped from the center. It can
  be used with max-width/max-height or independantly.
- quality: image quality (defaults to 1 = 100%).

## Limiting accepted file types

You can use the regular [`accept` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept).

```html
<input type="file" accept=".gif,.jpg,.jpeg,.png,.doc,.docx" /> <input type="file" accept="image/*" />
```

## Recommended css

- Hide preview element when no src is set
- Hide inputs until ready (avoids fouc)
- Change input background color when dropping files

```css
img:not([src]) {
  display: none;
}
.superfile:not(.superfile-ready) {
  visibility: hidden;
}
.superfile-drag input {
  background: palegoldenrod;
}
```

When set, the preview will get a `src` attribute like `blob:http://someaddress/30fde1c6-911e-4b50-a823-e778d100ffb3`
and be displayed

## Demo

https://codepen.io/lekoalabe/pen/wvdVoNa

## Custom element

https://formidable-elements.vercel.app/demo/superfile-input.html

## I need more

This is a simple improvement over regular file input.

If you need more, look at :

- https://pqina.nl/filepond/
- https://www.dropzonejs.com/
