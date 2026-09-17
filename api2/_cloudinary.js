"use strict";

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "jztoudcd",
  api_key:    "555959786381682",
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a Buffer to Cloudinary.
 * Returns the upload result (secure_url, public_id, etc.).
 */
function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    }).end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer };
