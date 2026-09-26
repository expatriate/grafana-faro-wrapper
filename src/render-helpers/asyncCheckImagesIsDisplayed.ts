import { queryAll } from '../utils/safeQuery';
import { allDisplayed, imagesOf } from './imageRules';
import { DEFAULT_IMAGE_TIMEOUT_MS, waitForImages } from './waitForImages';

export function asyncCheckImagesIsDisplayed(
  selector: string,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
): Promise<boolean> {
  return allDisplayed(queryAll(selector), (element) => waitForImages(imagesOf(element), timeoutMs));
}
