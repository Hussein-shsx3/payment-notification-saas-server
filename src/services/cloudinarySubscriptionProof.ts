import { v2 as cloudinary } from 'cloudinary';

export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim().length > 0) {
    return true;
  }
  const n = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const k = process.env.CLOUDINARY_API_KEY?.trim();
  const s = process.env.CLOUDINARY_API_SECRET?.trim();
  return !!(n && k && s);
}

function ensureConfigured(): void {
  if (process.env.CLOUDINARY_URL?.trim()) {
    cloudinary.config();
    return;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function uploadSubscriptionProofImage(buffer: Buffer): Promise<{ url: string; publicId: string }> {
  ensureConfigured();
  const folder = (process.env.CLOUDINARY_SUBSCRIPTION_FOLDER || 'subscription-proofs').replace(/^\//, '');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (err, result) => {
        if (err || !result?.secure_url || !result.public_id) {
          reject(err ?? new Error('Cloudinary upload failed'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function destroySubscriptionProofImage(publicId: string | undefined): Promise<void> {
  if (!publicId?.trim()) return;
  if (!isCloudinaryConfigured()) return;
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    /* ignore */
  }
}
