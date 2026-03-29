'use strict';

const nodemailer = require('nodemailer');

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return { host, port, user, pass, from };
}

let cachedTransporter = null;

function getTransporter() {
  const config = getSmtpConfig();
  if (!config) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    });
  }
  return { transporter: cachedTransporter, from: config.from };
}

async function notifyAdminsOfPendingUser({ user, wikiName, sitePrefix, adminEmails = [] }) {
  const transport = getTransporter();
  if (!transport) {
    console.log('SMTP not configured — skipping pending-user notification');
    return;
  }

  const fallback = process.env.ADMIN_EMAIL;
  const candidates = adminEmails.length > 0 ? adminEmails : (fallback ? [fallback] : []);
  const validEmails = candidates.filter((e) => e && e.includes('@'));
  if (validEmails.length === 0) {
    console.log('No admin emails found — skipping pending-user notification');
    return;
  }

  const externalBase = (process.env.OAUTH_EXTERNAL_BASE_URL || '').replace(/\/+$/, '');
  const adminUrl = externalBase
    ? `${externalBase}${sitePrefix}/admin`
    : `(admin page: ${sitePrefix}/admin)`;

  const subject = `[TiddlyHarbor] New pending user on ${wikiName}`;
  const text = [
    `A new user registered on wiki "${wikiName}" and is awaiting approval.`,
    '',
    `  Name:     ${user.displayName || user.username}`,
    `  Email:    ${user.email || '(none)'}`,
    `  Provider: ${user.oauthProvider || user.provider || 'unknown'}`,
    `  Username: ${user.username}`,
    '',
    `Approve or reject at: ${adminUrl}`,
    '',
    '— TiddlyHarbor'
  ].join('\n');

  try {
    await transport.transporter.sendMail({
      from: transport.from,
      to: validEmails.join(', '),
      subject,
      text
    });
    console.log(`Pending-user notification sent to ${validEmails.length} admin(s)`);
  } catch (err) {
    console.error('Failed to send pending-user notification:', err.message);
  }
}

module.exports = { notifyAdminsOfPendingUser };
