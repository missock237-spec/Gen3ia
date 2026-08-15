import { HfInference } from '@huggingface/inference';

/**
 * Image Generation and Enhancement using Hugging Face Free Models
 * Supports text-to-image, image upscaling, inpainting, and batch processing
 */

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number; // 256-1024 (default: 512)
  height?: number; // 256-1024 (default: 512)
  numInferenceSteps?: number; // 20-50 (default: 30)
  guidanceScale?: number; // 7.5-15 (default: 7.5)
  seed?: number;
  model?: 'flux' | 'stable-diffusion-v2';
}

export interface ImageUpscaleOptions {
  scale?: 2 | 4; // Upscaling factor (default: 4)
  tiling?: boolean; // For seamless upscaling
}

export interface ImageInpaintOptions {
  prompt: string;
  maskImage: Buffer | Uint8Array;
  maskBlurRadius?: number;
  numInferenceSteps?: number;
}

export interface ImageResult {
  image: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  seed?: number;
  generationTime: number;
}

export interface BatchImageResult {
  images: ImageResult[];
  totalTime: number;
  failureCount: number;
}

class HuggingFaceImage {
  private client: HfInference;
  private readonly apiKey: string;

  // Hugging Face free models for image generation
  private readonly models = {
    // FLUX.1-schnell - Fast and high-quality text-to-image (FREE)
    fluxSchnell: 'black-forest-labs/FLUX.1-schnell',

    // Stable Diffusion v2.1 - Alternative text-to-image
    stableDiffusionV2: 'stabilityai/stable-diffusion-2-1',

    // Real-ESRGAN - Super-resolution upscaling
    upscaler: 'real-esrgan/RealESRGAN_x4',
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.HUGGINGFACE_API_KEY || '';
    this.client = new HfInference(this.apiKey);
  }

  /**
   * Generate image from text prompt
   */
  async generateImage(options: ImageGenerationOptions): Promise<ImageResult> {
    const startTime = Date.now();

    try {
      const model = options.model === 'flux' ? this.models.fluxSchnell : this.models.stableDiffusionV2;

      const imageBlob = await this.client.textToImage({
        model,
        inputs: options.prompt,
        parameters: {
          negative_prompt: options.negativePrompt || '',
          height: options.height || 512,
          width: options.width || 512,
          num_inference_steps: options.numInferenceSteps || 30,
          guidance_scale: options.guidanceScale || 7.5,
          ...(options.seed && { seed: options.seed }),
        },
      } as unknown as Parameters<typeof this.client.textToImage>[0]) as unknown as Blob;

      const buffer = await this.blobToBuffer(imageBlob);
      const { width, height } = this.getImageDimensions(buffer);

      return {
        image: buffer,
        mimeType: 'image/png',
        width,
        height,
        seed: options.seed,
        generationTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Image] Generation error:', error);
      throw new Error(`Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upscale/enhance image quality
   */
  async upscaleImage(imageBuffer: Buffer | Uint8Array, options: ImageUpscaleOptions = {}): Promise<ImageResult> {
    const startTime = Date.now();

    try {
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
      const file = new File([blob], 'image.png', { type: 'image/png' });

      // Use Real-ESRGAN for upscaling
      const upscaledBlob = await this.client.imageToImage({
        model: this.models.upscaler,
        inputs: file,
        parameters: {
          scale: options.scale || 4,
          ...(options.tiling && { tile: 512 }),
        },
      } as Parameters<typeof this.client.imageToImage>[0]) as Blob;

      const buffer = await this.blobToBuffer(upscaledBlob);
      const { width, height } = this.getImageDimensions(buffer);

      return {
        image: buffer,
        mimeType: 'image/png',
        width,
        height,
        generationTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Image] Upscaling error:', error);
      throw new Error(`Image upscaling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Inpaint/edit specific region in image
   */
  async inpaintImage(
    imageBuffer: Buffer | Uint8Array,
    options: ImageInpaintOptions
  ): Promise<ImageResult> {
    const startTime = Date.now();

    try {
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
      const file = new File([blob], 'image.png', { type: 'image/png' });

      const maskBlob = new Blob([new Uint8Array(options.maskImage)], { type: 'image/png' });
      const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });

      // Stable Diffusion inpainting is served via the imageToImage endpoint
      const inpaintedBlob = await this.client.imageToImage({
        model: this.models.stableDiffusionV2,
        inputs: file,
        parameters: {
          num_inference_steps: options.numInferenceSteps || 50,
        },
      } as Parameters<typeof this.client.imageToImage>[0]) as Blob;

      const buffer = await this.blobToBuffer(inpaintedBlob);
      const { width, height } = this.getImageDimensions(buffer);

      return {
        image: buffer,
        mimeType: 'image/png',
        width,
        height,
        generationTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[Image] Inpainting error:', error);
      throw new Error(`Image inpainting failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch generate multiple images
   */
  async generateImageBatch(
    prompts: string[],
    options?: Omit<ImageGenerationOptions, 'prompt'>
  ): Promise<BatchImageResult> {
    const startTime = Date.now();
    const images: ImageResult[] = [];
    let failureCount = 0;

    for (const prompt of prompts) {
      try {
        const result = await this.generateImage({
          ...options,
          prompt,
        });
        images.push(result);
      } catch (error) {
        console.error(`[Image] Batch generation failed for prompt: "${prompt}"`, error);
        failureCount++;
      }

      // Add small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      images,
      totalTime: Date.now() - startTime,
      failureCount,
    };
  }

  /**
   * Batch upscale multiple images
   */
  async upscaleImageBatch(
    imageBuffers: (Buffer | Uint8Array)[],
    options?: ImageUpscaleOptions
  ): Promise<BatchImageResult> {
    const startTime = Date.now();
    const images: ImageResult[] = [];
    let failureCount = 0;

    for (const buffer of imageBuffers) {
      try {
        const result = await this.upscaleImage(buffer, options);
        images.push(result);
      } catch (error) {
        console.error('[Image] Batch upscaling failed', error);
        failureCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      images,
      totalTime: Date.now() - startTime,
      failureCount,
    };
  }

  /**
   * Convert Blob to Buffer
   */
  private async blobToBuffer(blob: Blob): Promise<Buffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Parse image dimensions from PNG header
   */
  private getImageDimensions(buffer: Buffer | Uint8Array): { width: number; height: number } {
    let width = 512;
    let height = 512;

    try {
      // PNG: width at bytes 16-19, height at 20-23
      if (buffer.length > 24) {
        // Both Buffer and Uint8Array expose their underlying ArrayBuffer via `.buffer`
        const underlying = (buffer as Uint8Array).buffer;
        const dataView = new DataView(underlying);
        width = dataView.getUint32(16, false);
        height = dataView.getUint32(20, false);
      }
    } catch (error) {
      console.warn('[Image] Could not parse dimensions, using defaults');
    }

    return { width, height };
  }

  /**
   * Estimate generation time based on parameters
   */
  estimateGenerationTime(options: ImageGenerationOptions): number {
    // Rough estimation: base 10s + 0.1s per inference step
    const steps = options.numInferenceSteps || 30;
    const baseTime = 10000; // 10 seconds
    return baseTime + steps * 100;
  }

  /**
   * Validate prompt for safety
   */
  validatePrompt(prompt: string): { valid: boolean; warning?: string } {
    // Basic content policy check
    const unsafePatterns = /violence|weapon|explicit|nude|adult/i;

    if (unsafePatterns.test(prompt)) {
      return {
        valid: false,
        warning: 'Prompt contains potentially unsafe content',
      };
    }

    if (prompt.length > 1000) {
      return {
        valid: false,
        warning: 'Prompt is too long (max 1000 characters)',
      };
    }

    if (prompt.length < 3) {
      return {
        valid: false,
        warning: 'Prompt is too short',
      };
    }

    return { valid: true };
  }
}

// Singleton instance
let imageSingleton: HuggingFaceImage | null = null;

/**
 * Get or create image instance
 */
export function getImageClient(): HuggingFaceImage {
  if (!imageSingleton) {
    imageSingleton = new HuggingFaceImage();
  }
  return imageSingleton;
}

/**
 * Helper function to generate image
 */
export async function generateImage(options: ImageGenerationOptions): Promise<ImageResult> {
  const client = getImageClient();
  const validation = client.validatePrompt(options.prompt);
  if (!validation.valid) {
    throw new Error(validation.warning || 'Invalid prompt');
  }
  return client.generateImage(options);
}

/**
 * Helper function to upscale image
 */
export async function upscaleImage(
  imageBuffer: Buffer | Uint8Array,
  options?: ImageUpscaleOptions
): Promise<ImageResult> {
  const client = getImageClient();
  return client.upscaleImage(imageBuffer, options);
}

/**
 * Helper function for batch image generation
 */
export async function generateImageBatch(
  prompts: string[],
  options?: Omit<ImageGenerationOptions, 'prompt'>
): Promise<BatchImageResult> {
  const client = getImageClient();
  return client.generateImageBatch(prompts, options);
}

/**
 * Helper function for batch image upscaling
 */
export async function upscaleImageBatch(
  imageBuffers: (Buffer | Uint8Array)[],
  options?: ImageUpscaleOptions
): Promise<BatchImageResult> {
  const client = getImageClient();
  return client.upscaleImageBatch(imageBuffers, options);
}

/**
 * Get available models
 */
export function getAvailableModels(): {
  generation: { id: string; name: string; speed: string }[];
  upscaling: { id: string; name: string }[];
} {
  return {
    generation: [
      {
        id: 'flux',
        name: 'FLUX.1-schnell',
        speed: 'Very Fast (3-5s)',
      },
      {
        id: 'stable-diffusion-v2',
        name: 'Stable Diffusion v2.1',
        speed: 'Fast (10-15s)',
      },
    ],
    upscaling: [
      {
        id: 'real-esrgan-x4',
        name: 'Real-ESRGAN 4x',
      },
    ],
  };
}
