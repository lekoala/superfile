# Superfile EXIF Addon

The **SuperfileExif** addon extends Superfile to preserve EXIF metadata during image resizing. This is essential when you need to keep GPS coordinates, camera information, timestamps, and other metadata intact after client-side image processing.

## Overview

When Superfile resizes images using the Canvas API, EXIF metadata is normally lost. This addon uses [piexifjs](https://github.com/hMatoba/piexifjs) to:

1. Extract EXIF data before resizing
2. Perform the resize operation
3. Re-insert the EXIF data into the resized image

## Installation

### 1. Include piexifjs

Load piexifjs before using SuperfileExif:

```html
<!-- From CDN -->
<script src="https://cdn.jsdelivr.net/npm/piexifjs@2.0.0/piexif.min.js"></script>

<!-- Or with npm/bun -->
npm install piexifjs
```

### 2. Import SuperfileExif

```javascript
// ES Modules
import SuperfileExif from "./superfile-exif.js";

// Or with CDN
import SuperfileExif from "https://cdn.jsdelivr.net/npm/superfile/superfile-exif.js";
```

### 3. Initialize

```javascript
// Initialize all file inputs with EXIF preservation
SuperfileExif.init();

// Or initialize specific inputs
import SuperfileExif from "./superfile-exif.js";
const input = document.querySelector("input[type=file]");
const sf = new SuperfileExif(input);
```

## Usage Example

```html
<div class="superfile">
  <input type="file" accept="image/*" data-max-width="1920" data-max-height="1920" />
  <img class="superfile-preview" />
  <button class="superfile-clear">Clear</button>
</div>

<div id="exif-info"></div>

<script type="module">
  import SuperfileExif from "./superfile-exif.js";
  
  // Initialize
  SuperfileExif.init();
  
  // Access EXIF data after upload
  document.querySelector("input[type=file]").addEventListener("change", (e) => {
    const sf = e.target._superfile; // Access instance if stored
    const exifData = sf.getExifData();
    
    if (exifData.hasExifGps) {
      console.log("GPS:", exifData.gps.lat, exifData.gps.lon);
    }
    if (exifData.timestamp) {
      console.log("Taken:", exifData.timestamp);
    }
  });
</script>
```

## API Reference

### SuperfileExif extends Superfile

All Superfile methods and options are available, plus:

#### `getExifData()`

Returns extracted EXIF information:

```javascript
{
  exif: Object|null,      // Raw EXIF object from piexif
  gps: Object|null,       // { lat: number, lon: number }
  timestamp: string|null, // Formatted date string
  hasExifGps: boolean     // Quick check for GPS data
}
```

#### `clearExifData()`

Manually clear stored EXIF data.

#### `clearPreview()`

Overridden to also clear EXIF data when clearing the preview.

## Extracted Data

### GPS Coordinates

When GPS data is present in EXIF:

```javascript
const exifData = sf.getExifData();
if (exifData.hasExifGps) {
  const { lat, lon } = exifData.gps;
  // lat: 40.7128, lon: -74.0060 (New York City)
}
```

GPS is automatically converted from DMS (Degrees, Minutes, Seconds) to decimal format.

### Timestamps

EXIF timestamps are automatically formatted:

```javascript
const exifData = sf.getExifData();
console.log(exifData.timestamp);
// "June 5, 2024 at 7:45 PM"
```

The addon looks for these fields in order:
1. `DateTimeOriginal` (when photo was taken)
2. `DateTime` (file modification)
3. `DateTimeDigitized` (digitization time)

## Dependencies

- **Superfile** - Base class (included)
- **piexifjs** - Must be loaded separately, addon gracefully degrades if not available

## Graceful Degradation

If piexifjs is not loaded, SuperfileExif automatically falls back to standard Superfile behavior:

```javascript
if (typeof window.piexif === "undefined") {
  console.warn("[SuperfileExif] piexifjs not loaded, falling back to standard processing");
  super.handleResizeImage(file, callback);
  return;
}
```

## How It Works

1. **Extraction Phase** - When an image is selected, the addon reads the file as a Data URL and extracts EXIF using piexifjs before any processing occurs.

2. **Resize Phase** - The image is resized using the standard Superfile canvas-based resizing (including any ratio cropping).

3. **Re-insertion Phase** - After resizing, the extracted EXIF data is serialized and inserted back into the resized image's base64 data, then converted back to a File object.

## Extending Superfile - A Tutorial

This addon demonstrates the proper way to extend Superfile:

### Basic Pattern

```javascript
import Superfile from "./superfile.js";

class MySuperfileAddon extends Superfile {
  constructor(inputElement) {
    super(inputElement);
    // Your initialization
  }
  
  // Override methods as needed
  handleResizeImage(file, callback) {
    // Custom logic
    // Call parent when done: super.handleResizeImage(file, callback);
  }
  
  static init(selector = "input[type=file]") {
    const list = document.querySelectorAll(selector);
    for (const el of list) {
      new MySuperfileAddon(el);
    }
  }
}
```

### Key Methods to Override

| Method | When to Override |
|--------|----------------|
| `handleResizeImage()` | Modify resize behavior or extract data before resize |
| `resizeImage()` | Custom resize algorithm |
| `createProcessedFile()` | Modify how the final File is created |
| `clearPreview()` | Cleanup custom data when clearing |
| `dispose()` | Cleanup custom event listeners |

### Preserving Parent Behavior

Always call `super.methodName()` when you want parent behavior:

```javascript
handleResizeImage(file, callback) {
  if (shouldSkipCustomLogic) {
    super.handleResizeImage(file, callback);
    return;
  }
  
  // Your custom logic
  processFile(file, (result) => {
    // Then call parent or do it yourself
    super.handleResizeImage(result, callback);
  });
}
```

## Browser Support

Same as Superfile + piexifjs support:
- Chrome 50+
- Firefox 45+
- Safari 10+
- Edge 79+

## License

MIT - Same as Superfile and piexifjs
