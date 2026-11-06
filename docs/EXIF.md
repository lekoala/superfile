# Images, metadata and privacy

Canvas recompression normally drops EXIF and other metadata. Superfile relies on native browser image decoding for orientation and tests an EXIF Orientation=6 fixture before resizing, so an already-oriented decode is not rotated a second time.

**V2 does not promise universal metadata removal.** Images can pass through unchanged when no processing is requested, dimensions are already satisfied, an optimization would enlarge the file, a format is unsupported, or the application permits fallback. Those originals can retain EXIF, GPS, camera details and color profiles.

V2 does not extract GPS or load piexifjs. The V1 `superfile-exif.js` subclass is not compatible with the new processor contract and is removed from V2. An optional metadata-preservation processor may be added later; it is not part of this release.

If metadata removal is mandatory, enforce and verify it on the server. Likewise, verify output dimensions, accepted formats, file size and content there. Client-side processing and MIME hints are not a security boundary.

Canvas behavior for wide-gamut profiles, extremely large photos and memory limits differs by engine and device. Real-device fixtures remain necessary in addition to desktop browser automation. See [verification](TESTING.md).
