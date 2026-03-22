import multer from 'multer';
import path from 'path';

const storage = multer.memoryStorage();

const allowedMime = /^image\/(jpeg|jpg|pjpeg|png|webp)$/i;

function allowedByExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
}

export const subscriptionProofUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (allowedMime.test(mime)) {
      cb(null, true);
      return;
    }
    // Some clients (especially mobile) send octet-stream or empty MIME for gallery JPGs.
    if (
      (mime === 'application/octet-stream' || mime === '' || mime === 'binary/octet-stream') &&
      allowedByExtension(file.originalname || '')
    ) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPEG (.jpg), PNG, or WebP images are allowed'));
  },
});
