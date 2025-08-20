"use strict";
/*
* compress.js
* A module that compress a image.
* compress(httpRequest, httpResponse, ReadableStream);
*/
const sharp = require('sharp')
const redirect = require('./redirect')
const { PassThrough, Transform } = require('stream');
const sharpStream = _ => sharp({ animated: !process.env.NO_ANIMATE, unlimited: true });
sharp.cache(false)

function compress(req, res, input) {
  const format = req.params.webp ? 'webp' : 'jpeg'
  
  // Set headers and announce trailers
  res.setHeader('cache-control', 'public, max-age=604800, stale-while-revalidate=86400')
  res.setHeader('content-type', 'image/' + format);
  res.setHeader('Trailer', 'x-original-size, x-bytes-saved');

  const transform = sharpStream()
    .grayscale(req.params.grayscale)
    .toFormat(format, {
      quality: req.params.quality,
      progressive: true,
      optimizeScans: true
    });

  let totalSize = 0;
  const passThrough = new PassThrough();
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      totalSize += chunk.length;
      this.push(chunk);
      callback();
    }
  });

  input.body
    .on('error', () => req.socket.destroy())
    .pipe(transform)
    .on('error', () => redirect(req, res))
    .pipe(counter)
    .pipe(passThrough)
    .on('error', () => redirect(req, res));

  // Set trailers when stream ends
  passThrough.on('end', () => {
    res.addTrailers({
      'x-original-size': req.params.originSize,
      'x-bytes-saved': req.params.originSize - totalSize
    });
  });

  passThrough.pipe(res);
}

module.exports = compress;
