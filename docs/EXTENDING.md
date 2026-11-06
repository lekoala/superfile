# Custom processors and external transports

## Custom local preparation

```js
const sf = new Superfile(input, {
  async process(file, { signal, input, entry, generation }) {
    signal.throwIfAborted();
    // Return a File, or { file: File, decision: string }.
    return file;
  },
});
```

Callbacks receive originals, not a previously compressed result. Ready entries are reused on additions/removals. Preparation is sequential per instance, including invalidated generations, to bound image memory. Custom async processors/validators must cooperate with AbortSignal and settle their promises; a callback that never settles can prevent later work from running. Stale results never commit.

A factory can expose `configure(input)` to validate per-input configuration before listeners are installed and return its processor function. The standard image processor uses this hook. This is a small function contract, not a plugin registry or exposed pipeline.

A camera integration should create a File and call `sf.addFiles([file])`. Only request camera access after an explicit user gesture and stop tracks on capture, cancel, error and disposal. No camera implementation is included in V2.

## Any manual transport

Superfile never builds FormData, sends HTTP requests, retries uploads or interprets responses. An application must await every relevant instance before taking the snapshot:

```js
const controls = Array.from(form.elements).filter(el => el.matches?.('input[type=file]:enabled'));
const fields = controls.map(el => Superfile.get(el)).filter(Boolean);
await Promise.all(fields.map(sf => sf.whenReady()));
const body = new FormData(form, submitter);
// Send and handle body in your application's transport.
```

`form.elements` includes external controls using `form="..."`. Build FormData immediately after readiness; another asynchronous wait can allow a new selection to start. If controls or generations can change during the wait, recheck them before snapshotting. A rejected wait should stop sending and expose the preparation error.

The native guard handles normal native submit events in capture. Transport listeners downstream should respect `event.defaultPrevented`. A root capture listener that runs first, `form.submit()` or an independently created FormData cannot be automatically delayed. Coordinate one submission owner; do not arrange competing resumptions.

Actual CSS, Actual Ajax, sco-pe, fetch and other transports consume this same public contract. Superfile has no dependency, imports, data attributes or events specific to any of them. Actual integration tests belong in the consumer repository and do not block Superfile publication. The local test suite uses a generic root consumer and an explicit manual request, not a private Ajax integration.

Native resumption uses [`requestSubmit`](https://html.spec.whatwg.org/multipage/forms.html#dom-form-requestsubmit-dev) so validation and submit button overrides are preserved. Direct `submit()` intentionally bypasses that event path.

## Optional autosubmit

For a dedicated autosubmit form, readiness can trigger submission:

```js
input.addEventListener('superfile:ready', () => {
  form.requestSubmit();
});
```

Use one submission owner. Do not also queue manual submissions while preparing, or use this naive recipe for several fields that can independently emit ready. Coalesce those events at the application level and account for an in-flight request. Superfile only reports preparation, never upload percentage or server success.
