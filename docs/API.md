# API Reference

Complete JavaScript API for Superfile.

## Constructor

### `new Superfile(inputElement)`

Create a new Superfile instance for a file input.

```javascript
import Superfile from "./superfile.js";

const input = document.querySelector("input[type=file]");
const sf = new Superfile(input);
```

**Parameters:**
- `inputElement` - `HTMLInputElement` - The file input to enhance

**Throws:**
- Error if input is not a valid file input

## Static Methods

### `Superfile.init(selector?)`

Initialize all matching file inputs automatically.

```javascript
// Initialize all file inputs
Superfile.init();

// Initialize specific inputs
Superfile.init("input[type=file].my-class");
Superfile.init("#specific-input");
```

**Parameters:**
- `selector` - `string` (optional) - CSS selector, defaults to `"input[type=file]"`

## Instance Properties

### Core Elements

| Property | Type | Description |
|----------|------|-------------|
| `inputElement` | `HTMLInputElement` | The original file input |
| `holderElement` | `HTMLElement` | Parent container with `.superfile` class |
| `previewElement` | `HTMLImageElement\|null` | The preview image element |
| `clearElement` | `HTMLButtonElement\|null` | The clear button element |
| `webcamElement` | `HTMLButtonElement\|null` | The webcam button element |

### Configuration (read-only after init)

| Property | Type | Description |
|----------|------|-------------|
| `disableResize` | `boolean` | Whether resizing is disabled |
| `maxWidth` | `number` | Maximum width constraint |
| `maxHeight` | `number` | Maximum height constraint |
| `hideClear` | `boolean` | Whether clear button is hidden initially |
| `imageRatio` | `string[]\|null` | Parsed ratio array `["16", "9"]` |
| `quality` | `number` | JPEG quality 0.0-1.0 |

## Instance Methods

### `showPreview()`

Manually trigger preview display. Called automatically on file selection.

```javascript
sf.showPreview();
```

### `clearPreview()`

Clear the file input and hide preview.

```javascript
sf.clearPreview();
```

Also:
- Removes `superfile-preview-active` class
- Revokes blob URLs (prevents memory leaks)
- Removes cloned preview elements (multiple files)
- Resets input value

### `takePicture()`

Trigger webcam capture flow. Called automatically when webcam button is clicked.

```javascript
// Usually triggered by click on .superfile-webcam button
sf.takePicture();
```

Opens camera stream, captures frame, crops to ratio, and sets as file value.

### `dispose()`

Clean up event listeners and revoke blob URLs.

```javascript
sf.dispose();
```

**Important:** Call when removing the element from DOM to prevent memory leaks.

Removes:
- Change listener from input
- Click listeners from clear/webcam buttons
- Drag/drop listeners from holder
- Revokes all blob URLs

### `handleEvent(event)`

Internal event dispatcher. Implements the `EventListener` interface.

```javascript
// Automatically called by browser event system
sf.handleEvent({ type: "change" });
sf.handleEvent({ type: "click", target: buttonElement });
```

Routes to `$change()`, `$click()`, `$drop()`, `$dragover()`, `$dragleave()` methods.

## Protected Methods (Advanced)

These methods can be overridden when extending Superfile.

### `handleResizeImage(file, callback)`

Process a single file through the resize pipeline.

```javascript
// Override in subclass
handleResizeImage(file, callback) {
  // Custom processing
  super.handleResizeImage(file, callback);
}
```

**Parameters:**
- `file` - `File` - The image file to process
- `callback` - `Function` - Called when processing complete

### `resizeImage(file, img, callback)`

Perform the actual canvas-based resize.

```javascript
resizeImage(file, img, callback) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  
  // Custom resize logic
  // ... canvas operations ...
  
  callback();
}
```

### `createProcessedFile(file, blob, callback)`

Create final File object and update the input's FileList.

```javascript
createProcessedFile(file, blob, callback) {
  const resizedFile = new File([blob], file.name, {
    type: file.type,
    lastModified: Date.now(),
  });
  
  // Update FileList via DataTransfer
  const container = new DataTransfer();
  // ... add files ...
  this.inputElement.files = container.files;
  
  callback();
}
```

### `processFiles(callback)`

Process all selected files.

```javascript
processFiles(callback) {
  const files = this.inputElement.files;
  for (const file of files) {
    this.handleResizeImage(file, callback);
  }
}
```

### `getTargetRatio()`

Calculate target aspect ratio from data-ratio attribute.

```javascript
const ratio = sf.getTargetRatio();
// 1 for "1:1"
// 1.777... for "16:9"
// 0 for no ratio set
```

**Returns:** `number` - Width/height ratio or 0 if not set

### `revokePreviewUrls()`

Revoke all blob URLs created for previews.

```javascript
sf.revokePreviewUrls();
```

Called automatically by `dispose()` and `clearPreview()`.

## Events

Superfile dispatches standard events you can listen for:

### Change Event

Standard input change event fires after processing:

```javascript
input.addEventListener("change", (e) => {
  // Files have been processed and resized
  console.log(input.files); // Processed FileList
});
```

### Custom Event (if needed)

You can extend to dispatch custom events:

```javascript
// In subclass
handleResizeImage(file, callback) {
  super.handleResizeImage(file, () => {
    this.inputElement.dispatchEvent(
      new CustomEvent("superfile:processed", { 
        detail: { original: file, processed: this.inputElement.files[0] }
      })
    );
    callback();
  });
}
```

## TypeScript Types

For TypeScript projects, types are available via JSDoc:

```typescript
// Import types from the JSDoc annotations
import type Superfile from "./superfile.js";

declare global {
  interface HTMLInputElement {
    _superfile?: Superfile;
  }
}
```

Or use the provided `jsconfig.json` for VS Code IntelliSense.

## Examples

### Manual Instance Access

```javascript
// Store reference during creation
const sf = new Superfile(input);
input._superfile = sf;

// Access later
input.addEventListener("change", () => {
  const sf = input._superfile;
  console.log(sf.maxWidth, sf.maxHeight);
});
```

### Programmatic File Set

```javascript
// Create a File and set it
const blob = await fetch(url).then(r => r.blob());
const file = new File([blob], "image.jpg", { type: "image/jpeg" });

const container = new DataTransfer();
container.items.add(file);
input.files = container.files;
input.dispatchEvent(new Event("change"));
```

### Custom Preview Logic

```javascript
class MySuperfile extends Superfile {
  showPreview() {
    super.showPreview();
    
    // Custom post-preview logic
    if (this.previewElement) {
      this.previewElement.style.opacity = "0";
      requestAnimationFrame(() => {
        this.previewElement.style.opacity = "1";
      });
    }
  }
}
```
