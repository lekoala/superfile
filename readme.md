# superfile

[![NPM](https://nodei.co/npm/superfile.png?mini=true)](https://nodei.co/npm/superfile/) 
[![Downloads](https://img.shields.io/npm/dt/superfile.svg)](https://www.npmjs.com/package/superfile)

## Intro

An ES6 class to improve uploaders. Works great with Bootstrap but works with any input.

- Resize image on client side to avoid large uploads
- Preview image
- Clear uploads

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
    <img src="" class="img-fluid superfile-preview" />
</div>
```

## Demo

https://codepen.io/lekoalabe/pen/wvdVoNa

## I need more

This is a simple improvement over regular file input.

If you need more, look at :
- https://pqina.nl/filepond/
- https://www.dropzonejs.com/