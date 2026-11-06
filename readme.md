# Superfile 2

**A better native file input.**

Prepare files locally, then submit an ordinary HTML form. Superfile handles selection, drag and drop, removal, optional image processing and optional previews. It has no runtime dependencies, required CSS, HTTP transport or framework integration.

```html
<form method="post" action="/photos" enctype="multipart/form-data">
  <div class="superfile">
    <label for="photo">Photo</label>
    <input id="photo" name="photo" type="file"
      accept="image/jpeg,image/png,image/webp"
      data-superfile data-max-width="1920" data-quality="0.85">
    <button type="button" data-superfile-clear>Clear</button>
    <div id="previews"></div>
  </div>
  <button type="submit">Save</button>
</form>
```

```js
import Superfile from 'superfile';
import { createImageProcessor } from 'superfile/image';
import { connectPreviews } from 'superfile/previews';

const sf = new Superfile(document.querySelector('#photo'), {
  process: createImageProcessor(),
});
connectPreviews(sf, { container: document.querySelector('#previews') });
```

Without JavaScript the input remains visible and submits originals. With Superfile, a native submission waits for preparation and keeps the original submit button and native validation. Your endpoint stays the same. Always enforce mandatory constraints on the server too.

For ordinary documents, import only the core:

```js
import Superfile from 'superfile';
const instances = Superfile.init(); // Only input[type=file][data-superfile]
```

Image processing is explicit. Without image options, files stay unchanged. Previews are optional. No CSS class or preview element is required by the core. For direct browser imports, use relative URLs to `superfile.js`, `image.js` and `previews.js`; `superfile.min.js` is the standalone core bundle.

Install with `bun add superfile` (or `npm install superfile`).

## Public API

- `addFiles(files)`: append with `multiple`, replace without it; returns a readiness promise.
- `removeFile(id)`: remove exactly one entry; returns a readiness promise.
- `clear()`: clear files, errors and queued native submission.
- `whenReady()`: wait for the latest generation, including replacement selections.
- `dispose()`: detach listeners and release resources; pending waits reject with `AbortError`.
- Read `input`, `files`, `entries`, `state`, `generation`; use `Superfile.get(input)` to retrieve an instance.

Native selection and drop replace the selection. File identities are independent of names. A failed batch restores the last valid FileList and blocks native submission until a new batch succeeds or the field is cleared. Reset cancels preparation and pending submission.

For any manual transport, wait **before** constructing FormData:

```js
await sf.whenReady();
const body = new FormData(sf.input.form);
// Your application owns sending body and handling the response.
```

Superfile emits bubbling `superfile:processing`, `superfile:ready`, `superfile:error`, `superfile:cleared` and `superfile:disposed` events on the input. Native `change` describes the raw selection; no second artificial `change` is emitted after processing.

## Documentation and development

[API](docs/API.md) · [Configuration](docs/CONFIGURATION.md) · [Migration from V1](docs/MIGRATION.md) · [Image metadata](docs/EXIF.md) · [Custom processors and transports](docs/EXTENDING.md) · [Contract and verification](docs/CONTRACT.md)

```sh
bun install
bun run start                  # Open http://127.0.0.1:4178/
bun test                       # Unit tests
bunx --bun playwright install  # Install browser engines once
bun run test:browser            # Playwright runner under Bun
bun run lint
bun run build
```

Browser contracts run in Chromium, Firefox and WebKit, including real multipart submissions to a local receiver. Real-device iOS/Android and wide-gamut/large-camera-image testing remain release checks. See [testing details](docs/TESTING.md).

Camera capture UI, interactive crop and EXIF preservation addons are deferred. Native `capture` remains available. Directory inputs are native passthrough only, preserving relative paths without image processing or individual removal.
