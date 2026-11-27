import { policyBounds } from './crop-policy.mjs';
import { compactReadingImage } from './vendor/motero/reading-image.mjs';
import { inkBox } from './vendor/crop-to-margin/ink-box.mjs';

const pixelsByPage = new Map();
self.onmessage = ({ data: { id, operation, index, pixels, lines, model, options } }) => {
  try {
    let result;
    if (operation === 'store') {
      pixelsByPage.set(index, { image: compactReadingImage(pixels), ink: inkBox(pixels) });
    }
    else if (operation === 'forget') {
      pixelsByPage.delete(index);
    }
    else {
      const { image, ink } = pixelsByPage.get(index) || {};
      result = policyBounds(image, lines, model, index, options, ink);
    }
    self.postMessage({ id, result });
  }
  catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
self.postMessage({ ready: true });
