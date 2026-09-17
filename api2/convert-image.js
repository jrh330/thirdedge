"use strict";

/**
 * POST /api2/convert-image
 * Accepts any image (including HEIC/HEIF) via multipart and returns a JPEG.
 * Used by the client to normalise HEIC files before the Crop screen, since
 * browsers cannot decode HEIC natively.
 *
 * No persistent storage — the bytes are returned immediately and discarded.
 */

const sharp = require("sharp");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!req.file?.buffer)    return res.status(400).json({ error: "No image received" });

  try {
    const jpeg = await sharp(req.file.buffer)
      .rotate()                           // honour EXIF orientation
      .jpeg({ quality: 88 })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", jpeg.length);
    return res.status(200).send(jpeg);
  } catch (err) {
    console.error("convert-image error:", err.message);
    return res.status(400).json({ error: "Could not convert that image file" });
  }
};
