# Tests and platform coverage

Use Bun 1.4.4 or later for development. Playwright 1.65 runs its runner under Bun explicitly:

```sh
bun install
bun test
bunx --bun playwright install chromium firefox webkit
bun run test:browser
bun run lint
bun run build
```

The package script invokes the Playwright CLI directly with Bun, avoiding a Windows `bunx` executable-shim issue with worker arguments. Playwright also supports `bunx --bun playwright test`; the direct invocation is the verified local path. TypeScript 7 checks the JavaScript sources and a strict consumer of the public declarations.

`bunfig.toml` scopes Bun's unit discovery to `test/unit`. Browser contracts live in `test/browser`, and Playwright starts `bun test/server.js` as a loopback-only fixture server. No simulated DOM is used to prove FileList, Canvas, validation or native submission.

The receiver parses real multipart requests. Contracts check original bytes without JavaScript, transformed bytes with JavaScript, submitter overrides, an external file input, multiple fields, coalesced submissions, invalid forms, reset cancellation, dialog forms, raw native change, atomic batches, duplicate identities and stale generations. The manual transport test sends its own request and handles its own 422 response. Image fixtures generated in-browser test crop geometry, transparency, MIME/name conversion, decimal quality, encoder/decoder failures and an embedded EXIF orientation tag. Directory fixtures check relative paths. Preview tests cover neutral documents, escaped filenames, keyboard removal, focus and URL cleanup.

Automated projects: Chromium, Firefox and WebKit on desktop. Passing on Playwright WebKit is **not** a certification for real iOS Safari, and emulated devices do not reproduce mobile memory pressure.

Release verification still needed:

- Real iOS Safari and Android browser: camera photos, native capture, directory availability, large images and memory pressure.
- Representative ICC/wide-gamut images and real-device camera files. EXIF module tests cover all eight orientations with pixel assertions, systematic JPEG/PNG/WebP removal, JPEG preservation, GPS opt-in and blocking normalization failures.
- Assistive technology checks for error announcements and input/drop/removal workflows.
- A concrete minimum-version policy tested on the chosen older browser versions. Current-engine success alone does not establish that policy.

Required platform capabilities for enhanced writes include DataTransfer construction and assignment to input.files. Native-submit resumption needs requestSubmit; the image module needs image decoding, Canvas 2D and toBlob. Unsupported mandatory transformations produce a blocking preparation error; configuration failure leaves only the native control. Inputs that require no transformations can retain their native FileList without reconstructing it.

CI installs all three browser engines on Linux, runs Bun unit tests, browser contracts, lint and build, and uploads failed traces. The local migration run uses Windows. The external Actual Ajax integration is tested by its consumer, independently of this library's generic transport contract.
