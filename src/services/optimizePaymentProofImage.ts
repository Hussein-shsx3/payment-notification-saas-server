import sharp from 'sharp';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Resize and re-encode payment proof images before Cloudinary upload.
 * Reduces bandwidth/storage; output is always JPEG for predictable size.
 */
export async function optimizePaymentProofImage(input: Buffer): Promise<Buffer> {
  const maxW = clamp(parseInt(process.env.PAYMENT_PROOF_MAX_WIDTH || '1920', 10) || 1920, 640, 4096);
  const quality = clamp(parseInt(process.env.PAYMENT_PROOF_JPEG_QUALITY || '82', 10) || 82, 60, 95);

  try {
    return await sharp(input)
      .rotate()
      .resize(maxW, maxW, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.warn('[payment-proof] optimize failed, uploading original bytes', err);
    return input;
  }
}
