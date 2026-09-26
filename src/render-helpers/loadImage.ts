import { isImageLoaded } from './imageRules';
import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages';

const MAX_REMEMBERED_IMAGES = 100;
const imagesBySource = new Map<string, HTMLImageElement>();

function imageFor(src: string): HTMLImageElement {
  const remembered = imagesBySource.get(src);
  if (remembered) {
    return remembered;
  }
  if (imagesBySource.size >= MAX_REMEMBERED_IMAGES) {
    imagesBySource.delete(imagesBySource.keys().next().value as string);
  }
  const image = new Image();
  image.src = src;
  imagesBySource.set(src, image);
  return image;
}

export function loadImage(src: string, timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS): Promise<boolean> {
  return isImageLoaded(imageFor(src), timeoutMs);
}
