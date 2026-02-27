import { v2 as cloudinary } from 'cloudinary';

/**
 * Uploads an image buffer to Cloudinary and returns the secure URL.
 * The cloudinary SDK auto-reads CLOUDINARY_URL from the environment:
 *   cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 */
export const uploadEventBanner = (
  fileBuffer: Buffer,
  folder = 'eventflow/banners',
): Promise<string> =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: 'image',
          format: 'webp',
          transformation: [{ width: 1280, crop: 'limit' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve(result.secure_url);
        },
      )
      .end(fileBuffer);
  });

/**
 * Deletes a Cloudinary asset by its public_id.
 */
export const deleteEventBanner = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId);
};
