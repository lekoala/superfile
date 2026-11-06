# API

## Initialization

```js
import Superfile from 'superfile';
import { createImageProcessor } from 'superfile/image';

const sf = new Superfile(input, {
  process: createImageProcessor({ maxWidth: 1920, quality: 0.85 }),
  maxSize: 20 * 1024 * 1024, // Optional limit on original bytes
  validate(file, { signal }) {
    // Optional synchronous/async validation; throw to reject this batch.
  },
});
```

A bare `input[type=file]` is sufficient. There is no required wrapper. An optional nearest `.superfile` or `[data-superfile-drop]` wrapper becomes the drop target and scopes `[data-superfile-clear]` controls. Use one file input per drop wrapper. `dropTarget` can explicitly supply an HTML element instead.

Initialization validates configuration before installing listeners. Image attributes without a processor throw. That leaves an ordinary native input, **without** any transformation or submission guarantee. Treat configuration exceptions as application errors; do not deliberately suppress them to enforce a client constraint.

`Superfile.init(selector?, options?)` returns instances for matching inputs, reusing existing ones. Its default selector is `input[type=file][data-superfile]`. It does not automatically run on import. `Superfile.get(input)` returns the registered instance or `undefined`. Constructing a second instance explicitly throws.

If initialization fails, instances created by that `init()` call are disposed; pre-existing instances remain registered. General options are validated before calling `process.configure(input)`, which must return a processor function. Custom configuration hooks must avoid external side effects: rollback cannot undo application-owned changes.

## Properties

| Property | Meaning |
| --- | --- |
| `input` | Original HTMLInputElement |
| `files` | Current native FileList, identical to `input.files` |
| `entries` | Array of frozen entry snapshots |
| `state` | `ready`, `processing` or `error` |
| `generation` | Current generation number |

An entry contains:

```js
{
  id,                 // Opaque identity, stable while the entry remains selected
  original,           // Original File
  file,               // Current/prepared File
  status,             // pending | processing | ready | error
  transformed,        // file !== original
  error,              // Error or null
  decision,           // Processor decision, or null before processing
}
```

Names need not be unique. An entry marked ready during a batch is not necessarily committed yet: only instance `state === 'ready'` and `whenReady()` guarantee the final FileList. After an error, entries describe the failed attempt; `input.files` has been restored to the last valid batch.

## Methods

`addFiles(iterable)` appends with `multiple`. Without `multiple` it replaces; a batch with more than one file throws before changing anything. Empty additions do nothing. Previously ready entries retain identity and are not compressed again. After an error, additions start from the last committed entries.

`removeFile(id)` removes one entry and invalidates obsolete processing. Unknown IDs do nothing. Individual removal is unavailable after a blocking batch error: select again or clear instead. It is also unavailable for directory inputs.

Both methods return `Promise<Entry[]>`, following the latest generation. They can throw synchronously for invalid arguments or unavailable operations. Handle promise rejection if processing fails.

`clear()` synchronously empties the input, invalidates work, clears blocking errors and cancels a queued native submission. Existing readiness waits resolve to `[]`. It emits `cleared`, not `ready`.

Use `sf.clear()` instead of assigning `input.value = ''`: direct assignments do not emit events and cannot synchronize entry snapshots. Native form reset is supported.

`whenReady()` resolves with the ready entry snapshots. If another generation starts while it is pending, it follows that generation. A blocking error rejects; a later successful selection permits new calls to resolve. A resolved promise cannot track subsequent selections: construct FormData immediately after awaiting it, without introducing another asynchronous gap.

`dispose()` is idempotent. It aborts pending work, rejects outstanding waits with `AbortError`, disconnects form/drop/input listeners and emits `disposed`. Previews connected through the standard helper are also disposed. If processing or an error was active, the last committed files are restored. The input remains usable as a native control. Methods other than repeat disposal cannot be used afterwards.

Before `disposed` is emitted, entries are emptied and state becomes `ready`, meaning no work remains. This does not make the disposed instance reusable.

## Events

Events are CustomEvents dispatched on the input and bubble. All include `detail.generation` and `detail.entries` snapshots.

| Event | Additional detail |
| --- | --- |
| `superfile:processing` | Beginning of a generation |
| `superfile:ready` | `files`: final FileList |
| `superfile:error` | `id` (null for batch errors), `error`, `blocking: true` |
| `superfile:cleared` | Empty selection |
| `superfile:disposed` | Instance destroyed |

No synthetic `change` after preparation, no upload progress and no network-success events. Image fallback decisions are exposed on entries, not reported as blocking errors.

A supported file drop emits one bubbling synthetic `change` with the raw selection before processors run. Use `whenReady()` for prepared files. File drag/drop defaults are canceled even when the input is disabled; disabled inputs do not select files. Drop events continue bubbling, so wrapper/document listeners can observe them. Programmatic `addFiles()` and `removeFile()` do not emit `change`.

## Stable error codes

Errors created by the library have a `code` from the exported TypeScript union `SuperfileErrorCode`. `SuperfileError` describes an `Error` with that code; it is a type, not a runtime class. Messages remain diagnostic and may change. Configuration and processor-result errors retain `TypeError` where applicable; other failures use `Error`.

| Code | Meaning |
| --- | --- |
| `CONFIGURATION` | Invalid options, initialization, arguments or unavailable API operation (including directory restrictions) |
| `MAX_SIZE` | Original file exceeds `maxSize` |
| `PROCESSOR_RESULT` | A processor returned neither a File nor a supported result containing a File |
| `FILE_LIST` | DataTransfer construction, population or assignment failed, or the browser ignored the FileList write |
| `DECODE` | Image decoding failed or produced unusable dimensions |
| `ENCODE` | Canvas preparation or image encoding failed, including a missing output Blob |
| `UNSUPPORTED_FORMAT` | A required image transformation or EXIF preservation cannot support the source/output format; also a browser returning a different output MIME |
| `EXIF_CONTAINER` | Malformed, ambiguous or unsupported EXIF container, or pixels whose orientation prevents the requested EXIF operation |

Blocking failures expose the same error through `superfile:error`, the affected entry (if any), and readiness rejection. FileList failures use a null event `id`. Exceptions from native FileList writes and image decoding/encoding are wrapped with the original exception in `cause`.

Errors thrown by application callbacks (`validate`, `process`, `configure`, `onMetadata`, supplied EXIF codec methods, and preview formatters) are not assigned library codes. Existing Error objects retain their identity and custom properties. The core still converts non-Error rejections into Error diagnostics without adding a code. Cancellation keeps its native `AbortError`/AbortSignal reason; DOMException's native numeric `code` is unrelated to this union. Optional image fallbacks continue returning decisions rather than errors.

Use codes for translation, with a separate application-error policy. For example:

```js
const messages = {
  CONFIGURATION: 'Configuration du champ fichier invalide.',
  MAX_SIZE: 'Fichier trop volumineux.',
  PROCESSOR_RESULT: 'Le traitement a renvoyé un fichier invalide.',
  FILE_LIST: 'Impossible de mettre à jour les fichiers du champ.',
  DECODE: 'Impossible de lire cette image.',
  ENCODE: 'Impossible de préparer cette image.',
  UNSUPPORTED_FORMAT: 'Ce format ne permet pas le traitement demandé.',
  EXIF_CONTAINER: 'Les métadonnées de cette image ne peuvent pas être traitées.',
};
function translateError(error) {
  return Object.hasOwn(messages, error.code)
    ? messages[error.code]
    : error.message; // Application chooses how to present its own errors.
}
input.addEventListener('superfile:error', ({ detail }) => {
  errorElement.textContent = translateError(detail.error);
});
```

## Native form submission

One capture listener per form blocks premature submit events and resumes once with `requestSubmit(originalSubmitter)`. It waits for all enabled Superfile controls, including external inputs with `form="..."`. Multiple clicks during processing retain the **first** submitter. Native validation runs again; submitter action, method, encoding and validation overrides are retained. `method="dialog"` closes the dialog without waiting for file preparation.

Reset, clear, disposal, reassignment of a control to another form, removal of the submitter, or a detached form cancel pending submission. Canceled native resets leave the selection intact. After a native reset, Superfile state is cleared in a microtask, once cancellation has been checked.

The native guard does not intercept `form.submit()` or arbitrary manual `FormData` construction. Native validation can prevent a submit event from being raised at all, e.g. a required field still empty during a programmatic addition. In that case there is no submit intent to replay; submit after readiness. See [external transports](EXTENDING.md).

## EXIF processor

`createExifProcessor({ mode, process, codec, preserveGPS, onMetadata })` from `superfile/exif` wraps an optional image processor. Removal is the default and is enforced after every image result; failed enforcement blocks. JPEG preservation and extraction use an explicitly supplied codec. `readExif(file, codec)` extracts original JPEG tags/GPS/time without processing. See [EXIF options, supported formats and guarantees](EXIF.md).

## Previews

```js
import { connectPreviews } from 'superfile/previews';
const view = connectPreviews(sf, { container, template, image, status });
view.dispose();
```

Only `container` is required. `template` is an optional HTMLTemplateElement cloned into one row per entry. Optional `image` binds a standalone image/avatar to the first entry. Optional `status` receives preparation/error text; otherwise a live status element is inserted before the container. The helper owns container contents and the bound image while connected.

Supported template slots: `data-superfile-name`, `data-superfile-size`, `data-superfile-type`, `data-superfile-error`, `data-superfile-thumbnail` on an image, and `data-superfile-remove` on a button. Names are assigned with textContent. The default renderer provides the same slots without a template.

PDF and other non-image files get neutral rows. Individual removal is disabled for failed batches and directory inputs. Object URLs are revoked on every replacement, clear and disposal; keyboard focus moves to an adjacent removal button or the original input.

Previews bind `entry.file`, so names, types, sizes and thumbnails reflect the prepared file. An image that fails to decode is hidden and its URL is immediately revoked; the neutral row and removal control remain. Old image error listeners are removed when replacing or disposing previews, including the standalone image.

All English UI text can be customized through these optional settings:

| Option | Default / behavior |
| --- | --- |
| `labels.preparing` | `Preparing files…` |
| `labels.error` | `File preparation failed. Select files again or clear the field.` |
| `labels.remove` | `Remove` in the default renderer; custom template text is retained unless this option is supplied |
| `labels.removeLabel(file)` | Accessible label `Remove ${file.name}`, using the prepared file |
| `formatSize(bytes)` | Readable decimal units (`B`, `kB`, `MB`…), at most one decimal place using the browser locale, e.g. `2 MB` for 2,003,508 bytes; called for both original and prepared sizes when transformed, joined by ` → ` |
| `formatError(error, entry)` | `error.message`; receives the entry snapshot for per-file context |

For a French preview, reuse `translateError` above:

```js
const view = connectPreviews(sf, {
  container,
  labels: {
    preparing: 'Préparation des fichiers…',
    error: 'Échec de la préparation. Sélectionnez à nouveau les fichiers ou videz le champ.',
    remove: 'Supprimer',
    removeLabel: file => `Supprimer ${file.name}`,
  },
  formatSize: bytes => `${new Intl.NumberFormat('fr-FR').format(bytes)} octets`,
  formatError: translateError,
});
```

Labels and formatter results are assigned as text, never interpreted as HTML. A supplied `status` element is cleared on disposal. No success-count announcement is added by default.
