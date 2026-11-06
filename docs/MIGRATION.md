# Migration from Superfile 1

V2 is a major API change. It keeps the native input and local preparation model while splitting optional rendering and image handling from the core.

| V1 | V2 |
| --- | --- |
| `Superfile.init()` enhances every file input | Only inputs with `data-superfile`; explicit selectors still supported |
| Automatic 1920 × 1920 resize | Import image processor and set dimensions explicitly |
| Constructor only takes input | `new Superfile(input, options)` |
| Required `.superfile` wrapper | Bare input works; wrapper is an optional drop target |
| `.superfile-preview` cloned image | `connectPreviews(sf, { container, template?, image? })` |
| `.superfile-clear` binding | `[data-superfile-clear]` inside the drop wrapper, or call `sf.clear()` |
| `data-disable-resize` | Omit image options/processor |
| `data-hide-clear` | Application controls button visibility |
| `inputElement` | `input` |
| `processFiles`, `resizeImage`, DOM internals/subclass overrides | Public `process` function and entry snapshots |
| Built-in webcam UI | Deferred optional module; native `capture` still works |
| `superfile-exif.js` subclass | V1-only addon; preservation deferred in V2 |
| Native `change` sometimes used as completion | Await `whenReady()` or listen to `superfile:ready` |
| Files replaced by matching filename | Stable per-entry IDs, duplicate names preserved |

Common attributes `data-max-width`, `data-max-height`, `data-ratio`, `data-quality` retain their intended meanings. Quality parsing now accepts decimals correctly. Add an explicit processor when using them:

```js
import Superfile from 'superfile';
import { createImageProcessor } from 'superfile/image';
const instances = Superfile.init('input[type=file][data-superfile]', {
  process: createImageProcessor({ maxWidth: 1920, maxHeight: 1920 }),
});
```

Remove CSS such as `.superfile:not(.superfile-ready) { visibility: hidden; }`. V2 does not apply ready/preview classes from V1. Keep a visible, labeled native input. Preview rendering and any CSS are now explicit and independent.

A failed transformation no longer risks silently submitting originals or a partially prepared selection. The prior valid FileList is restored and submission blocks until a new batch succeeds or the field is cleared. Audit consumers that previously sent FormData in a native change handler: they must await readiness.

The package is ESM with public entries `superfile`, `superfile/image`, `superfile/previews`. The standalone `superfile.min.js` contains only core behavior. Relative source imports work directly in modern browsers. No image or preview module is loaded automatically.