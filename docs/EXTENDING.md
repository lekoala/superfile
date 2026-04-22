# Extending Superfile

This guide shows how to create custom Superfile addons by extending the base class.

## Basic Pattern

```javascript
import Superfile from "./superfile.js";

class MyAddon extends Superfile {
  constructor(inputElement) {
    super(inputElement);
    // Your initialization
  }
  
  static init(selector = "input[type=file]") {
    const list = document.querySelectorAll(selector);
    for (const el of list) {
      new MyAddon(el);
    }
  }
}

export default MyAddon;
```

## Key Principles

### 1. Always Call Super Constructor

```javascript
constructor(inputElement) {
  super(inputElement); // Sets up all base functionality
  
  // Your custom init
  this.customData = null;
}
```

### 2. Override Methods Strategically

| Method | When to Override | Call Super? |
|--------|------------------|-------------|
| `handleResizeImage()` | Pre/post processing hooks | Yes, unless fully replacing |
| `resizeImage()` | Custom resize algorithm | Optional |
| `createProcessedFile()` | Modify File creation | Usually yes |
| `clearPreview()` | Cleanup custom data | Yes |
| `dispose()` | Cleanup custom listeners | Yes |

### 3. Use Method Naming Convention

Event handlers use `$` prefix:
- `$change()` - File selected
- `$click()` - Button clicked
- `$drop()` - File dropped
- `$dragover()` - Drag over
- `$dragleave()` - Drag leave

## Common Patterns

### Pre-Processing Hook

Run code before resize:

```javascript
handleResizeImage(file, callback) {
  // Extract data before processing
  this.extractData(file);
  
  // Call parent for actual resize
  super.handleResizeImage(file, callback);
}
```

### Post-Processing Hook

Run code after resize:

```javascript
handleResizeImage(file, callback) {
  const originalCallback = callback;
  
  super.handleResizeImage(file, () => {
    // Post-processing
    this.onProcessed();
    
    // Call original callback
    originalCallback();
  });
}
```

### Replace Processing Entirely

Skip parent and do it yourself:

```javascript
handleResizeImage(file, callback) {
  if (shouldSkipCustom) {
    super.handleResizeImage(file, callback);
    return;
  }
  
  // Your custom resize
  this.customResize(file, (result) => {
    this.createProcessedFile(file, result, callback);
  });
}
```

### Add Custom Event Listeners

```javascript
constructor(inputElement) {
  super(inputElement);
  
  // Add your listeners
  this.customButton = this.holderElement.querySelector(".my-button");
  if (this.customButton) {
    this.customButton.addEventListener("click", this);
  }
}

// Handle custom events
$click(e) {
  // Check if it's your button first
  if (e.target.closest(".my-button")) {
    this.doCustomAction();
    return;
  }
  
  // Call parent for standard buttons
  super.$click(e);
}

dispose() {
  // Remove your listeners
  if (this.customButton) {
    this.customButton.removeEventListener("click", this);
  }
  
  // Always call super.dispose()
  super.dispose();
}
```

## Real Examples

### Watermark Addon

Add a watermark to all uploaded images:

```javascript
class WatermarkSuperfile extends Superfile {
  constructor(inputElement) {
    super(inputElement);
    this.watermarkText = inputElement.dataset.watermark || "© My Site";
  }
  
  resizeImage(file, img, callback) {
    // Do standard resize
    const canvas = document.createElement("canvas");
    // ... resize logic ...
    
    // Add watermark
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "20px Arial";
    ctx.fillText(this.watermarkText, 10, canvas.height - 20);
    
    // Continue
    ctx.canvas.toBlob((blob) => {
      this.createProcessedFile(file, blob, callback);
    }, file.type, this.quality);
  }
}
```

### File Validation Addon

Add file validation with custom error display:

```javascript
class ValidatingSuperfile extends Superfile {
  constructor(inputElement) {
    super(inputElement);
    this.errorElement = this.holderElement.querySelector(".error-message");
    this.maxFileSize = parseInt(inputElement.dataset.maxSize, 10) || 5 * 1024 * 1024; // 5MB
  }
  
  handleResizeImage(file, callback) {
    // Validate before processing
    if (file.size > this.maxFileSize) {
      this.showError(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${(this.maxFileSize / 1024 / 1024).toFixed(1)}MB)`);
      callback(); // Still call callback to complete flow
      return;
    }
    
    if (!file.type.match(/image.*/)) {
      this.showError("Only images are allowed");
      callback();
      return;
    }
    
    this.clearError();
    super.handleResizeImage(file, callback);
  }
  
  showError(message) {
    if (this.errorElement) {
      this.errorElement.textContent = message;
      this.errorElement.style.display = "block";
    }
  }
  
  clearError() {
    if (this.errorElement) {
      this.errorElement.style.display = "none";
    }
  }
  
  clearPreview() {
    super.clearPreview();
    this.clearError();
  }
}
```

### Analytics Addon

Track upload metrics:

```javascript
class AnalyticsSuperfile extends Superfile {
  constructor(inputElement) {
    super(inputElement);
    this.startTime = null;
    this.originalSize = 0;
  }
  
  handleResizeImage(file, callback) {
    this.startTime = performance.now();
    this.originalSize = file.size;
    
    const originalCallback = callback;
    
    super.handleResizeImage(file, () => {
      // Track metrics
      const processedFile = Array.from(this.inputElement.files).find(
        f => f.name === file.name
      );
      
      if (processedFile) {
        this.trackMetrics({
          originalSize: this.originalSize,
          processedSize: processedFile.size,
          compressionRatio: processedFile.size / this.originalSize,
          processingTime: performance.now() - this.startTime,
          fileType: file.type,
          dimensions: { width: this.maxWidth, height: this.maxHeight }
        });
      }
      
      originalCallback();
    });
  }
  
  trackMetrics(data) {
    // Send to analytics service
    console.log("[Analytics]", data);
    
    // Example: Send to your backend
    // fetch("/api/analytics", { method: "POST", body: JSON.stringify(data) });
  }
}
```

## Best Practices

### 1. Graceful Degradation

Always handle missing optional dependencies:

```javascript
handleResizeImage(file, callback) {
  if (typeof window.myOptionalLibrary === "undefined") {
    console.warn("[MyAddon] Optional library not loaded, using standard processing");
    super.handleResizeImage(file, callback);
    return;
  }
  
  // Custom processing
}
```

### 2. Cleanup in dispose()

Always clean up custom resources:

```javascript
dispose() {
  // Custom cleanup
  this.customData = null;
  this.observer?.disconnect();
  
  // Important: Call super last
  super.dispose();
}
```

### 3. Preserve Callback Chain

Always call the callback, even on errors:

```javascript
handleResizeImage(file, callback) {
  try {
    // Processing
    super.handleResizeImage(file, callback);
  } catch (e) {
    console.error(e);
    callback(); // Still call to complete the flow
  }
}
```

### 4. Access Parent Element

The holder element is the `.superfile` container:

```javascript
constructor(inputElement) {
  super(inputElement);
  
  // Find custom elements within the component
  this.customElement = this.holderElement.querySelector(".my-custom-element");
}
```

### 5. State Management

Store custom state on the instance:

```javascript
constructor(inputElement) {
  super(inputElement);
  this.state = {
    isProcessing: false,
    retryCount: 0,
    customData: null
  };
}
```

## Testing Your Addon

Use the same test setup as Superfile:

```javascript
import { describe, it, expect, beforeEach } from "bun:test";
import "./setup.js";
import MyAddon from "../my-addon.js";

describe("MyAddon", () => {
  let container;
  
  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    container.className = "superfile";
    document.body.appendChild(container);
  });
  
  it("should initialize with custom data", () => {
    container.innerHTML = `<input type="file" data-custom="value" />`;
    const input = container.querySelector("input");
    const addon = new MyAddon(input);
    
    expect(addon.customData).toBe("value");
  });
});
```

## See Also

- [EXIF Addon](EXIF.md) - Complete working example
- [API Reference](API.md) - All methods documented
- [Configuration](CONFIGURATION.md) - Data attributes guide
