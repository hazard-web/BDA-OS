const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Uploads a base64 Data URL to Cloudinary.
 * @param {string} base64Str - data URL (e.g. data:application/pdf;base64,...)
 * @param {string} folder - Cloudinary folder
 * @param {{ resourceType?: string, publicId?: string }} [opts]
 * @returns {Promise<string>} secure HTTPS URL
 */
async function uploadBase64(base64Str, folder = 'payroll_portal', opts = {}) {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('Cloudinary environment variables are not configured in .env');
  }
  try {
    const result = await cloudinary.uploader.upload(base64Str, {
      folder,
      resource_type: opts.resourceType || 'auto',
      public_id: opts.publicId || undefined,
      type: 'upload',
      access_mode: 'public',
    });
    return result.secure_url;
  } catch (error) {
    throw new Error(error.message || 'Cloudinary upload failed');
  }
}

function cloudinaryResourceType(mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  // PDF + Office docs must be raw so Drive/Office Online can fetch them
  return 'raw';
}

module.exports = {
  cloudinary,
  uploadBase64,
  cloudinaryResourceType,
};
