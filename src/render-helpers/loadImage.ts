import { isImageLoaded } from './imageRules';
import { DEFAULT_IMAGE_TIMEOUT_MS } from './waitForImages';

const MAX_REMEMBERED_IMAGES = 100;
const BROKEN_IMAGE_RETRY_MS = 5000;

interface RememberedImage {
  image: HTMLImageElement;
  brokenAt?: number;
}

const imagesByUrl = new Map<string, RememberedImage>();

function absoluteUrl(src: string): string {
  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

const isRetryDue = ({ brokenAt }: RememberedImage) =>
  brokenAt !== undefined && Date.now() - brokenAt >= BROKEN_IMAGE_RETRY_MS;

function forgetOneImage() {
  const entries = Array.from(imagesByUrl);
  const [url] = entries.find(([, { brokenAt }]) => brokenAt === undefined) ?? entries[0];
  imagesByUrl.delete(url);
}

function rememberImage(url: string): RememberedImage {
  const remembered = imagesByUrl.get(url);
  if (remembered && !isRetryDue(remembered)) {
    return remembered;
  }
  imagesByUrl.delete(url);
  if (imagesByUrl.size >= MAX_REMEMBERED_IMAGES) {
    forgetOneImage();
  }
  const image = new Image();
  image.src = url;
  const fresh = { image };
  imagesByUrl.set(url, fresh);
  return fresh;
}

export async function loadImage(
  src: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  const remembered = rememberImage(absoluteUrl(src));
  const loaded = await isImageLoaded(remembered.image, timeoutMs);
  if (!loaded && remembered.image.complete && remembered.brokenAt === undefined) {
    remembered.brokenAt = Date.now();
  }
  return loaded;
}
