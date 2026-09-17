#!/usr/bin/env node
'use strict';

/**
 * scripts/invite.js — CLI for invite management.
 *
 * Usage:
 *   node scripts/invite.js create <name>
 *   node scripts/invite.js revoke <token>
 *
 * Environment:
 *   BASE_URL      — defaults to http://localhost:3000
 *   ADMIN_SECRET  — required
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

const [,, command, ...args] = process.argv;

const BASE_URL     = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

if (!ADMIN_SECRET) {
  console.error('Error: ADMIN_SECRET environment variable is not set');
  process.exit(1);
}

function request(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type':    'application/json',
        'X-Admin-Secret':  ADMIN_SECRET,
        'Content-Length':  Buffer.byteLength(bodyStr),
      },
    };

    const req = transport.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  if (command === 'create') {
    const name = args.join(' ');
    if (!name) {
      console.error('Usage: node scripts/invite.js create <name>');
      process.exit(1);
    }
    const { status, body } = await request('POST', `${BASE_URL}/admin/invites`, { name });
    if (status !== 200) {
      console.error(`Error ${status}:`, body);
      process.exit(1);
    }
    console.log('Join URL:', body.joinUrl);
    console.log('Token:', body.token);

  } else if (command === 'revoke') {
    const token = args[0];
    if (!token) {
      console.error('Usage: node scripts/invite.js revoke <token>');
      process.exit(1);
    }
    const { status, body } = await request('DELETE', `${BASE_URL}/admin/invites/${token}`);
    if (status !== 200) {
      console.error(`Error ${status}:`, body);
      process.exit(1);
    }
    console.log('Revoked:', body);

  } else {
    console.error('Usage: node scripts/invite.js create <name>');
    console.error('       node scripts/invite.js revoke <token>');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
