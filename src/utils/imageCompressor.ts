/**
 * Utility to compress images to small base64 strings
 * so they can be saved safely in Firestore (under 1MB, typically ~30-50KB)
 * and stored offline in localStorage.
 */
export function compressImage(fileOrUrl: File | string, maxW = 500, maxH = 500, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio
      if (width > height) {
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
      } else {
        if (height > maxH) {
          width = Math.round((width * maxH) / height);
          height = maxH;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = (err) => {
      reject(err);
    };

    if (typeof fileOrUrl === 'string') {
      img.src = fileOrUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          img.src = e.target.result as string;
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrUrl);
    }
  });
}

/**
 * Capitalizes names/sentences
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Formats timestamps elegantly
 */
export function formatTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}
