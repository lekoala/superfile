# Superfile Documentation

Welcome to the Superfile documentation. This folder contains comprehensive guides for using and extending Superfile.

## Quick Links

| Document | Description |
|----------|-------------|
| [Configuration](CONFIGURATION.md) | All data attributes and options |
| [API Reference](API.md) | JavaScript API methods and properties |
| [EXIF Addon](EXIF.md) | Preserving metadata during resize |
| [Extending](EXTENDING.md) | Creating your own Superfile addons |

## What is Superfile?

Superfile is a lightweight (~450 lines), zero-dependency ES6 class that enhances HTML file inputs with client-side image processing capabilities.

### Key Features

- **Image resizing** - Reduce file size before upload (default max: 1920x1920px)
- **Aspect ratio cropping** - Crop from center to maintain specific ratios
- **Image preview** - Instant preview with blob URLs
- **Drag & drop** - Drop files directly onto the input
- **Clear button** - Easy file clearing
- **Webcam capture** - Take photos directly from camera
- **Multiple files** - Support for multiple file selection
- **Zero dependencies** - No external libraries required

### Basic Usage

```html
<div class="superfile">
  <input type="file" accept="image/*" />
  <img class="superfile-preview" />
  <button class="superfile-clear">Clear</button>
</div>

<script type="module">
  import Superfile from "./superfile.js";
  Superfile.init();
</script>
```

```css
/* Hide preview until image is loaded */
img:not([src]) {
  display: none;
}

/* Prevent flash of unstyled content */
.superfile:not(.superfile-ready) {
  visibility: hidden;
}
```

## File Structure

```
superfile/
├── superfile.js           # Main source file
├── superfile.min.js       # Minified bundle
├── superfile-exif.js      # EXIF preservation addon
├── demo.html              # Working examples
├── docs/                  # Documentation
│   ├── README.md          # This file
│   ├── CONFIGURATION.md   # Options reference
│   ├── API.md             # API documentation
│   ├── EXIF.md            # EXIF addon guide
│   └── EXTENDING.md       # Extension tutorial
└── test/                  # Test suite
    └── superfile.test.js
```

## Browser Support

- Chrome 50+
- Firefox 45+
- Safari 10+
- Edge 79+

## CDN

```html
<script type="module">
  import Superfile from "https://cdn.jsdelivr.net/npm/superfile/superfile.js";
  Superfile.init();
</script>
```

## Size

| File | Size | Gzipped |
|------|------|---------|
| superfile.js | ~12 KB | ~3.5 KB |
| superfile.min.js | ~6 KB | ~2.5 KB |

## License

MIT - See [LICENSE](../LICENSE) for details.
