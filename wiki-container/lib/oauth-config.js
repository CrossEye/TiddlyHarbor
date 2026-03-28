'use strict';

const PROVIDERS = {
  github: {
    name: 'github',
    displayName: 'GitHub',
    authorizationURL: 'https://github.com/login/oauth/authorize',
    tokenURL: 'https://github.com/login/oauth/access_token',
    scope: ['user:email'],
    envPrefix: 'OAUTH_GITHUB'
  }
};

function getExternalBaseUrl() {
  return (process.env.OAUTH_EXTERNAL_BASE_URL || '').replace(/\/+$/, '');
}

function getProviderCredentials(provider) {
  const clientId = process.env[`${provider.envPrefix}_CLIENT_ID`] || '';
  const clientSecret = process.env[`${provider.envPrefix}_CLIENT_SECRET`] || '';
  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

function getEnabledProviders() {
  const baseUrl = getExternalBaseUrl();
  if (!baseUrl) {
    return [];
  }

  const enabled = [];
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    const credentials = getProviderCredentials(provider);
    if (credentials) {
      enabled.push({
        ...provider,
        ...credentials
      });
    }
  }

  return enabled;
}

function getCallbackUrl(providerName, sitePrefix) {
  const baseUrl = getExternalBaseUrl();
  if (!baseUrl) {
    throw new Error('OAUTH_EXTERNAL_BASE_URL is not configured');
  }

  return `${baseUrl}${sitePrefix}/auth/${providerName}/callback`;
}

module.exports = {
  PROVIDERS,
  getCallbackUrl,
  getEnabledProviders,
  getExternalBaseUrl
};
