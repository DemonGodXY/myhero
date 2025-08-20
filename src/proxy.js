"use strict";
/*
* proxy.js
* The bandwidth hero proxy handler.
* proxy(httpRequest, httpResponse);
*/
const http = require('http');
const https = require('https');
const url = require('url');
const pick = require('lodash').pick;
const shouldCompress = require("./shouldCompress");
const redirect = require("./redirect");
const compress = require("./compress");

// Connection pooling with keep-alive
const httpAgent = new http.Agent({ 
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

const httpsAgent = new https.Agent({ 
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

// Maximum redirects to follow
const MAX_REDIRECTS = 4;

async function proxy(req, res, redirectCount = 0) {
  /*
  * Avoid loopback that could causing server hang.
  */
  if (
    req.headers["via"] == "1.1 bandwidth-hero" &&
    ["127.0.0.1", "::1"].includes(req.headers["x-forwarded-for"] || req.ip)
  ) {
    return redirect(req, res);
  }

  try {
    const parsedUrl = url.parse(req.params.url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      agent: isHttps ? httpsAgent : httpAgent,
      timeout: 5000, // 5 second timeout
      headers: {
        ...pick(req.headers, ["cookie", "dnt", "referer", "range"]),
        "user-agent": "Bandwidth-Hero Compressor",
        "x-forwarded-for": req.headers["x-forwarded-for"] || req.ip,
        via: "1.1 bandwidth-hero",
      }
    };

    const originReq = httpModule.request(options, (originRes) => {
      _onRequestResponse(originRes, req, res, redirectCount);
    });

    // Handle request timeout
    originReq.setTimeout(5000, () => {
      originReq.destroy();
      redirect(req, res);
    });

    originReq.on('error', (err) => {
      _onRequestError(req, res, err);
    });

    originReq.end();
  } catch (err) {
    _onRequestError(req, res, err);
  }
}

function _onRequestError(req, res, err) {
  // Ignore invalid URL.
  if (err.code === "ERR_INVALID_URL") return res.status(400).send("Invalid URL");
  /*
  * When there's a real error, Redirect then destroy the stream immediately.
  */
  redirect(req, res);
  console.error(err);
}

function _onRequestResponse(originRes, req, res, redirectCount) {
  if (originRes.statusCode >= 400) {
    originRes.destroy();
    return redirect(req, res);
  }

  // Handle redirects with limit checking
  if (originRes.statusCode >= 300 && originRes.statusCode < 400 && originRes.headers.location) {
    originRes.destroy();
    
    // Check redirect limit
    if (redirectCount >= MAX_REDIRECTS) {
      return redirect(req, res);
    }

    try {
      const redirectUrl = new URL(originRes.headers.location, req.params.url).href;
      req.params.url = redirectUrl;
      return proxy(req, res, redirectCount + 1);
    } catch (err) {
      return redirect(req, res);
    }
  }

  res.setHeader("content-encoding", "identity");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

  req.params.originType = originRes.headers["content-type"] || "";
  req.params.originSize = originRes.headers["content-length"] || "0";

  originRes.on('error', _ => req.socket.destroy());

  if (shouldCompress(req)) {
    /*
    * sharp support stream. So pipe it.
    */
    return compress(req, res, { body: originRes });
  } else {
    originRes.destroy();
    return redirect(req, res);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  httpAgent.destroy();
  httpsAgent.destroy();
});

process.on('SIGINT', () => {
  httpAgent.destroy();
  httpsAgent.destroy();
});

module.exports = proxy;
