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
  /*
  * input.pipe => sharp (The compressor) => Send to httpResponse
  * The following headers:
  * | Header Name | Description | Value |
  * |---------------|-----------------------------------|----------------------------|
  * |x-original-size|Original photo size |OriginSize |
  * |x-bytes-saved |Saved bandwidth from original photo|OriginSize - Compressed Size|
  */
  res.setHeader('cache-control', 'public, max-age=604800, stale-while-revalidate=86400')
  res.setHeader('content-type', 'image/' + format);

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

  passThrough.on('end', () => {
    res.setHeader('x-original-size', req.params.originSize);
    res.setHeader('x-bytes-saved', req.params.originSize - totalSize);
  });

  passThrough.pipe(res);
}

module.exports = compress;
