"use strict";
const sharp = require('sharp');
const redirect = require('./redirect');
const { Transform } = require('stream');
const sharpStream = () => sharp({ 
  animated: !process.env.NO_ANIMATE, 
  unlimited: true 
});
sharp.cache(false);

function compress(req, res, input) {
  const format = req.params.webp ? 'webp' : 'jpeg';
  
  // Set headers immediately (without size info)
  res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  res.setHeader('Content-Type', `image/${format}`);
  res.setHeader('X-Original-Size', req.params.originSize);
  
  // Create transform stream for compression
  const transform = sharpStream()
    .grayscale(req.params.grayscale)
    .toFormat(format, {
      quality: req.params.quality,
      progressive: true,
      optimizeScans: true
    });

  // Create chunk sender transform
  let totalSize = 0;
  const chunkSender = new Transform({
    transform(chunk, encoding, callback) {
      totalSize += chunk.length;
      
      // Send chunk immediately
      if (!res.write(chunk)) {
        // Handle backpressure
        res.once('drain', () => callback());
      } else {
        callback();
      }
    },
    flush(callback) {
      // Set final size headers and end response
      res.setHeader('X-Bytes-Saved', req.params.originSize - totalSize);
      res.end();
      callback();
    }
  });

  // Handle stream pipeline with error handling
  input.body
    .on('error', (err) => {
      console.error('Input error:', err);
      req.socket.destroy();
    })
    .pipe(transform)
    .on('error', (err) => {
      console.error('Transform error:', err);
      redirect(req, res);
    })
    .pipe(chunkSender)
    .on('error', (err) => {
      console.error('Chunk sender error:', err);
      redirect(req, res);
    });
}

module.exports = compress;
