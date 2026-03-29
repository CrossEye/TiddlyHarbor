'use strict';

const passport = require('passport');
const { Strategy: GitHubStrategy } = require('passport-github2');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { getCallbackUrl } = require('./oauth-config');

function createGitHubStrategy(provider, sitePrefix) {
  return new GitHubStrategy(
    {
      clientID: provider.clientId,
      clientSecret: provider.clientSecret,
      callbackURL: getCallbackUrl('github', sitePrefix),
      scope: provider.scope || ['user:email']
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : null;

      done(null, {
        provider: 'github',
        oauthId: String(profile.id),
        email,
        displayName: profile.displayName || profile.username || null
      });
    }
  );
}

function createGoogleStrategy(provider, sitePrefix) {
  return new GoogleStrategy(
    {
      clientID: provider.clientId,
      clientSecret: provider.clientSecret,
      callbackURL: getCallbackUrl('google', sitePrefix),
      scope: provider.scope || ['openid', 'email', 'profile']
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : null;

      done(null, {
        provider: 'google',
        oauthId: String(profile.id),
        email,
        displayName: profile.displayName || null
      });
    }
  );
}

const strategyFactories = {
  github: createGitHubStrategy,
  google: createGoogleStrategy
};

function initializeStrategies(enabledProviders, sitePrefix) {
  for (const provider of enabledProviders) {
    const factory = strategyFactories[provider.name];
    if (factory) {
      passport.use(provider.name, factory(provider, sitePrefix));
    }
  }
}

module.exports = {
  initializeStrategies,
  passport
};
