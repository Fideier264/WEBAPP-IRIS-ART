import type { ArtTemplate } from './artTemplates';

export type RenderArtCompositeInput = {
  textureUri: string;
  template: ArtTemplate;
  outputWidth?: number;
  /** Product print aspect ratio (width/height), e.g. 1 for square canvas */
  outputAspectRatio?: number;
};

/**
 * Native builds: composite export runs on web (production). Uploads iris texture only on device.
 */
export async function renderArtCompositeToLocalUri(input: RenderArtCompositeInput): Promise<string> {
  console.warn(
    'renderArtComposite: native export not available — uploading iris texture without template overlay.'
  );
  return input.textureUri;
}
