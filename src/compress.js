"use strict";
const sharp = require('sharp');
const redirect = require('./redirect');
const { Writable } = require('stream');
const sharpStream = () => sharp({ 
  animated: !process.env.NO_ANIMATE, 
  unlimited: true 
});
sharp.cache(false);

function compress(req, res, input) {
  const format = req.params.webp ? 'webp' : 'jpeg';
  
  // Create transform stream for compression
  const transform = sharpStream()
    .grayscale(req.params.grayscale)
    .toFormat(format, {
      quality: req.params.quality,
      progressive: true,
      optimizeScans: true
    });

  // Buffer to collect compressed data
  const chunks = [];
  const bufferStream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });

  // Handle stream pipeline
  input.body
    .on('error', () => req.socket.destroy())
    .pipe(transform)
    .on('error', () => redirect(req, res))
    .pipe(bufferStream)
    .on('error', () => redirect(req, res));

  // When compression is complete
  bufferStream.on('finish', () => {
    const compressedData = Buffer.concat(chunks);
    const compressedSize = compressedData.length;
    const originalSize = parseInt(req.params.originSize) || 0;
    
    // Set all headers before sending response
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    res.setHeader('Content-Type', `image/${format}`);
    res.setHeader('Content-Length', compressedSize);
    res.setHeader('X-Original-Size', originalSize);
    res.setHeader('X-Bytes-Saved', Math.max(0, originalSize - compressedSize));
    
    // Send buffered response
    res.status(200).end(compressedData);
  });
}

module.exports = compress;
