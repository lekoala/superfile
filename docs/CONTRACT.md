# Superfile 2 contract

## Boundaries

Superfile owns local preparation and the native input. It never imports a transport, constructs FormData, sends HTTP, manages persisted server attachments or requires CSS. External transports consume `whenReady()`, entries and standard DOM events. Integration with Actual CSS belongs in that repository and is not a release gate here.

Image handling is explicitly imported; previews are independent. The core has no image codec, image renderer, camera UI or interactive crop. There is no generic plugin system. The package exports core, image and previews; the only standalone minified build is the core.

## Invariants

1. Without JavaScript, the native input stays visible, labeled and usable.
2. Native selection/drop replace; `addFiles()` appends with `multiple` and otherwise replaces a single file. Duplicate names remain distinct.
3. A generation prepares sequentially and commits its complete result once. Native input files can temporarily contain the newly selected raw files before `change`.
4. Stale generations cannot commit or refresh current previews. Pending readiness follows the latest generation. Clear/reset resolve empty; disposal rejects with AbortError.
5. The input's ready FileList is the submission payload. Internal entries additionally describe pending work and failed attempts.
6. A failed batch restores the last valid FileList and leaves a blocking error. No partial batch or silent old-file submission. A successful new batch or clear resolves the error.
7. A single native coordinator per form waits for all enabled fields, including external controls. It coalesces submit attempts and preserves the first submitter through requestSubmit and repeated native validation. Reset, clear and disposal cancel the queued intent. Dialog-only submission remains native.
8. Custom transports must snapshot FormData after readiness. Scripts running earlier in capture or calling submit() directly are outside the native guard's guarantee.
9. Explicit dimensions/crop/conversion are obligations for images. Quality alone is opportunistic. Non-image documents pass through. Explicit original fallback is observable in entries.
10. Image options without a processor are a configuration error before enhancement. The native input remains, without transformation guarantees. Mandatory rules also belong on the server.
11. Directory selection is native passthrough only, without FileList reconstruction, per-file removal or image transformation.
12. Preview URLs and listeners are released. No preview is necessary to process or submit.

## Delivery scope

Core selection, identity, lifecycle and submission coordination; explicit image resize/compression/center crop; optional simple/template previews; independent native and manual-transport demos; ESM exports, migration documentation, browser contract tests and CI.

Deferred: camera module, EXIF preservation and interactive cropping. Real-device mobile, wide-gamut color and extreme-image-memory verification remain release checks. No release or publication is performed by implementing this contract.
