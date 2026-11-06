# Configuration

There is no implicit 1920px resize in V2. Without image options, originals pass through unchanged. Image configuration requires an explicitly installed `createImageProcessor()` from `superfile/image`.

## Image options

| HTML attribute | Factory option | Contract |
| --- | --- | --- |
| `data-max-width` | `maxWidth` | Positive integer maximum width |
| `data-max-height` | `maxHeight` | Positive integer maximum height |
| `data-ratio` | `ratio` | Positive ratio, e.g. `1:1`, `16:9`, `4/3` or `1.5` |
| `data-quality` | `quality` | Number 0–1, or integer percentage 0–100 |
| `data-format` | `format` | `image/jpeg`, `image/png` or `image/webp` |
| — | `fallback` | `block` (default), or explicit `original` |
| — | `background` | Canvas fill color for explicitly encoded JPEG, default white |
| — | `reencode` | Boolean, default false; force canvas encoding even for conforming/larger images |

Factory options override HTML attributes. Configuration is read at initialization, not live-observed. Invalid options throw before the input is enhanced. Numeric values are parsed completely: `0.85` works; `85px`, empty strings and invalid ratios fail.

Dimensions, crop and conversion are mandatory constraints for applicable image files. Already conforming images do not need re-encoding. Quality is opportunistic: if encoding fails or makes an otherwise conforming image larger, the original is kept. An output needed to satisfy crop/size/format constraints is kept even when it is larger. No enlargement is performed, apart from unavoidable single-pixel rounding on tiny output sizes.

The image processor handles JPEG, non-animated PNG and non-animated WebP. GIF, animated PNG/WebP, SVG, HEIC and other unsupported image formats are preserved for opportunistic work; mandatory transformations reject unless `fallback: 'original'` was explicitly enabled. PDF and other non-image files always pass through unchanged, subject to general validation.

Input MIME types are hints; neither they nor `accept` prove the actual content is safe. A decoder or encoder failure rejects a mandatory operation. If a browser returns another MIME type instead of the requested encoder, that output is rejected. Explicit conversion updates both MIME and filename extension. PNG transparency is retained unless JPEG conversion was requested; JPEG uses the configured background.

When processing is active, JPEG/PNG/WebP signatures take precedence over declared MIME, including empty MIME and `application/octet-stream`. Decoding and animation checks use the detected type. Originals kept without encoding retain their original MIME; encoded outputs use the actual encoder MIME. Unknown signatures use the declared MIME: unsupported `image/*` follows the fallback policy, while other files pass through. Unsupported images mislabeled as non-images cannot be identified by this limited detector; enforce an application/server allowlist when required.

Fallbacks are visible through `entry.decision`: `not-applicable`, `already-conforming`, `unsupported-original`, `larger-original`, `encoding-failed-original`, `fallback-original`, or `transformed`.

`reencode: true` makes encoding mandatory even without geometry/format changes. It may increase file size; it does not itself promise EXIF removal. Wrap with [`createExifProcessor`](EXIF.md) for a verified EXIF policy that also covers image-processor fallbacks.

## Core options and native attributes

`maxSize` limits each original file in bytes. `validate(file, context)` is an optional synchronous or async callback: throw an error to reject the batch. `accept` remains the native picker hint; applications needing additional client restrictions can enforce them through `validate`. All restrictions also belong on the server.

`multiple`, `name`, `required`, `disabled`, `form`, `capture`, form method/encoding and submit button overrides retain their HTML meanings. Selection/drop replace; additions use the explicit API. For a single input, dropping several files keeps the first; `addFiles()` instead rejects a multi-file argument to expose programming errors.

`webkitdirectory` is native passthrough only. No image transformation, reconstructed FileList, programmatic additions or individual removal. Relative paths remain browser-provided. Mandatory image settings on a selected directory produce a blocking error rather than silently discarding paths. Opportunistic quality settings are skipped for directories. `clear()` and reset remain available.

No stylesheet is required. The optional drop wrapper receives `.superfile-drag` while dragging. Do not hide the input while waiting for JavaScript: native fallback and keyboard access must remain available.
