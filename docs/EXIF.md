# Images, EXIF and privacy

The image processor alone does not define an EXIF policy: canvas encoding generally drops metadata, but originals can pass through unchanged. Install `createExifProcessor` from `superfile/exif` when EXIF handling must be systematic. There is no automatic EXIF handling on import.

## Remove EXIF consistently

```js
import Superfile from 'superfile';
import { createImageProcessor } from 'superfile/image';
import { createExifProcessor } from 'superfile/exif';

const sf = new Superfile(input, {
  process: createExifProcessor({
    mode: 'remove', // Default; no dependency or codec needed
    process: createImageProcessor({ maxWidth: 1920, quality: 0.85 }),
  }),
});
```

Omit the inner `process` to use the default image processor: without image attributes it requests no resize/compression, while any `data-max-width`, `data-format`, etc. on the input still apply. The EXIF policy is applied **after** the inner processor, including `already-conforming`, `larger-original`, `encoding-failed-original` and explicit `fallback: 'original'` results. An original fallback never bypasses EXIF removal.

Removal supports JPEG APP1 `Exif`, PNG `eXIf` and WebP `EXIF` containers, including multiple EXIF blocks. Without rotation/mirroring, removal edits container bytes without recompressing pixels. WebP RIFF size and the EXIF feature flag are updated. Other chunks/segments are retained. Animation is retained when removing EXIF directly from an unrotated PNG/WebP; the inner image processor's animation restrictions still apply.

When EXIF orientation is 2–8, removal first applies browser-native orientation through canvas. This avoids changing how the image is displayed when its orientation tag disappears. This encoding is mandatory even if it increases file size. Orientation normalization can lose quality/color information and cannot preserve animation; if unavailable, processing **rejects**. The module never silently uploads the oriented original. Filename, actual output MIME and `lastModified` are retained, except when an inner conversion changes name/MIME.

Recognized JPEG/PNG/WebP signatures are checked even on files with a missing or incorrect MIME type; their MIME is corrected. Other declared `image/*` formats (GIF, SVG, HEIC, TIFF, etc.), malformed supported containers and invalid orientation values reject the batch. Ordinary non-image files pass through; they are not sanitized. Directory selections reject because their native passthrough contract cannot enforce this policy.

The result decision is `exif-removed`, including when no EXIF was present. If no pixels/bytes/MIME needed changing, the original File can be reused.

## Extract metadata or preserve JPEG EXIF

Extraction and preservation accept an application-supplied [piexifjs-compatible codec](https://piexifjs.readthedocs.io/en/latest/functions.html). Superfile never fetches or imports this dependency. Install `piexifjs` in the consuming application or provide its browser global.

```js
import piexif from 'piexifjs';
import { createExifProcessor, readExif } from 'superfile/exif';

const metadata = await readExif(originalFile, piexif);
// metadata: { tags, gps: { lat, lon } | null, timestamp: string | null } | null

const metadataByFile = new WeakMap();
const sf = new Superfile(input, {
  process: createExifProcessor({
    mode: 'preserve',
    codec: piexif,
    preserveGPS: true, // Defaults to false
    process: createImageProcessor({ maxWidth: 1920 }),
    onMetadata(metadata, original, { signal }) {
      signal.throwIfAborted();
      metadataByFile.set(original, metadata);
    },
  }),
});
```

`readExif(file, codec)` returns null for a non-JPEG or a JPEG without EXIF. Malformed JPEG/EXIF and ambiguous multiple EXIF blocks reject. `gps` validates references, rational denominators and coordinate bounds, including valid zero coordinates. `timestamp` is the original wall-time string (`DateTimeOriginal`, then `DateTimeDigitized`, then IFD0 `DateTime`); no timezone or display locale is invented. Raw decoded tags remain available in `tags`.

`onMetadata(metadata, original, context)` runs before the inner processor and can also be used in `mode: 'remove'`, to extract coordinates before removing them from the file. It receives null when supported extraction finds no metadata. It may be async and must cooperate with cancellation. Callbacks can run for a subsequently canceled/failed batch: use committed entries after `whenReady()` when consuming stored metadata. Use original File identity or `context.entry.id`, not filenames, to distinguish files. Modifying the callback's tags does not change the preserved snapshot.

Preservation supports JPEG input and output only and rejects other images/conversions. It preserves tags supported by the supplied codec, **excludes the GPS IFD unless `preserveGPS: true`**, and removes the original thumbnail/IFD1. If transformed, it sets orientation to 1 and updates image/pixel dimensions using the final decoded image. On unchanged pixels it retains their original orientation. A custom inner processor must produce physically normalized pixels with no non-normal orientation tag when it returns a new File. Codec or normalization failures block; there is no implicit metadata-loss fallback. Decisions are `exif-preserved` or `exif-absent`.

The module does not request device location or inject replacement coordinates. Keep that application behavior explicit and distinguish the photo's coordinates from the device's position at submission time.

## Scope of the guarantee

This module handles the native EXIF containers listed above. **EXIF removal is not removal of all metadata**: XMP (including copies of EXIF/GPS fields), IPTC, comments, ICC/color profiles and metadata embedded in other chunks/segments can remain. Preservation also does not promise to preserve ICC/XMP or opaque proprietary camera structures across canvas encoding/codec serialization. If you require complete anonymization, use a server-side metadata policy for every accepted format.

Client-side processing only applies to enhanced controls and coordinated submission. Disabling/bypassing JavaScript or mislabeling an unsupported format can evade client policy. Validate actual content, metadata, dimensions and sizes on the server when enforcement is required.

The V1 `superfile-exif.js` subclass remains incompatible with V2; migrate to the processor wrapper above.

Canvas behavior for wide-gamut profiles, extremely large photos and memory limits differs by engine and device. Real-device fixtures remain necessary in addition to desktop browser automation. See [verification](TESTING.md).
