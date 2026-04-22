# Configuration Guide

Superfile is configured entirely through HTML data attributes. No JavaScript configuration required!

## Data Attributes

### `data-max-width` / `data-max-height`

Set maximum dimensions for the resized image. Aspect ratio is preserved.

```html
<input type="file" data-max-width="800" data-max-height="600" />
```

| Default | Type | Example |
|---------|------|---------|
| 1920 | Integer (pixels) | `data-max-width="800"` |

### `data-ratio`

Crop the image to a specific aspect ratio from the center. Supports `:` or `/` separators.

```html
<!-- Square (avatars) -->
<input type="file" data-ratio="1:1" />

<!-- 16:9 (widescreen) -->
<input type="file" data-ratio="16:9" />

<!-- Alternative syntax -->
<input type="file" data-ratio="4/3" />
```

Common ratios:
- `1:1` - Square (avatars, profile pictures)
- `4:3` - Standard photo
- `16:9` - Widescreen, video
- `3:2` - Classic photo
- `2.39:1` - Cinema widescreen

### `data-quality`

JPEG compression quality. Accepts 0-1 decimal or 0-100 integer (converted automatically).

```html
<!-- Decimal (0.0 - 1.0) -->
<input type="file" data-quality="0.85" />

<!-- Percentage (1-100) -->
<input type="file" data-quality="85" />
```

| Default | Range | Notes |
|---------|-------|-------|
| 1 (100%) | 0.0 - 1.0 or 1-100 | Lower = smaller file, more compression artifacts |

### `data-disable-resize`

Skip image resizing entirely. Original files are kept unchanged (except EXIF rotation).

```html
<input type="file" data-disable-resize="1" />
```

Useful when:
- You want original file sizes
- Files are pre-optimized
- Resizing is handled server-side

### `data-hide-clear`

Hide the clear button until a preview is shown.

```html
<input type="file" data-hide-clear="1" />
```

Useful for:
- Cleaner initial UI
- Avatar uploaders
- Mobile interfaces

## HTML Attributes

### `accept`

Standard HTML attribute to limit file types:

```html
<!-- Only images -->
<input type="file" accept="image/*" />

<!-- Specific formats -->
<input type="file" accept=".jpg,.jpeg,.png,.webp" />

<!-- Multiple types -->
<input type="file" accept="image/*,.pdf,.doc" />
```

### `multiple`

Allow multiple file selection:

```html
<input type="file" multiple accept="image/*" />
```

### `directory` / `webkitdirectory`

Allow directory upload (with `multiple`):

```html
<input type="file" multiple directory webkitdirectory accept="image/*" />
```

## Complete Example

```html
<div class="superfile avatar-upload">
  <label>Profile Photo</label>
  <div class="input-group">
    <input 
      type="file" 
      accept="image/*"
      data-max-width="400"
      data-max-height="400"
      data-ratio="1:1"
      data-quality="90"
      data-hide-clear="1"
    />
    <button class="superfile-clear" type="button">×</button>
  </div>
  <img class="superfile-preview" alt="Preview" />
</div>
```

This creates:
- Square crop from center (1:1 ratio)
- 400x400 max size (retina: 800x800 for 2x displays)
- 90% JPEG quality
- Hidden clear button until image selected
- Image preview below input

## CSS States

Superfile adds CSS classes you can style:

| Class | When Applied |
|-------|--------------|
| `.superfile-ready` | After initialization |
| `.superfile-preview-active` | When preview is showing |
| `.superfile-drag` | During drag hover |
| `.superfile-clone` | On cloned preview elements (multiple files) |

```css
/* Initial state - prevent FOUC */
.superfile:not(.superfile-ready) {
  visibility: hidden;
}

/* Drag highlight */
.superfile-drag {
  background: palegoldenrod;
}

/* Preview visible */
.superfile-preview-active .superfile-preview {
  border: 2px solid #007bff;
}
```

## Preset Value Example

Show an existing image as the initial state:

```html
<div class="superfile">
  <input type="file" accept="image/*" data-max-width="200" data-ratio="1:1" />
  <img src="/existing-avatar.jpg" class="superfile-preview" />
  <button class="superfile-clear">Clear</button>
</div>
```

The preview will show immediately on page load, and clear button works as expected.
