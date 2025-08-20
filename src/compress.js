"use strict";
/*
* compress.js
* A module that compress a image.
* compress(httpRequest, httpResponse, ReadableStream);
*/
const sharp = require('sharp')
const redirect = require('./redirect')
const { PassThrough } = require('stream');
const sharpStream = _ => sharp({ animated: !process.env.NO_ANIMATE, unlimited: true });
sharp.cache(false)

function compress(req, res, input) {
  const format = req.params.webp ? 'webp' : 'jpeg'
  
  // Set all headers before streaming begins
  res.setHeader('cache-control', 'public, max-age=604800, stale-while-revalidate=86400')
  res.setHeader('content-type', 'image/' + format);
  res.setHeader('x-original-size', req.params.originSize);
  // Note: We can't set x-bytes-saved because we don't know the final size yet

  const transform = sharpStream()
    .grayscale(req.params.grayscale)
    .toFormat(format, {
      quality: req.params.quality,
      progressive: true,
      optimizeScans: true
    });

  const passThrough = new PassThrough();

  input.body
    .on('error', () => req.socket.destroy())
    .pipe(transform)
    .on('error', () => redirect(req, res))
    .pipe(passThrough)
    .on('error', () => redirect(req, res));

  // Start streaming immediately
  passThrough.pipe(res);
}

module.exports = compress;
