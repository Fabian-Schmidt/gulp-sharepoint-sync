'use strict';
/**
 * Methods for ACS authentication module.
 * This is mostly copied from https://github.com/wictorwilen/gulp-spsync
 * Original Copyright Wictor Wilén
 *
 * @author wictorwilen
 * @author Fabian-Schmidt
 */
var helpers = require('./auth_helpers');
var assign = require('object-assign');
var url = require('url');
var request = require('request-promise');

module.exports = authModule;

function authModule() {
    this.config = {
        site: null,
        auth_realm: null,
        auth_clientId: null,
        auth_clientSecret: null,
        auth_ACS_globalEndPointPrefix: "accounts",
        auth_ACS_hostUrl: "accesscontrol.windows.net",
        auth_ACS_metadataEndPointRelativeUrl: "/metadata/json/1",
        auth_ACS_S2SProtocol: "OAuth2",
        auth_ACS_sharePointPrincipal: "00000003-0000-0ff1-ce00-000000000000"
    }
    this.tokenResponse = null;
    this.getStsUrl = function (realm) {
        var self = this;
        if (this.config.logLevel >= 3) {
            this.config.log('Locating STS Url for ' + realm)
        }
        var url = 'https://' + this.config.auth_ACS_globalEndPointPrefix + "." + this.config.auth_ACS_hostUrl + this.config.auth_ACS_metadataEndPointRelativeUrl + "?realm=" + realm;
        return request
            .get(url)
            .then(function (data) {
                var endpoints = JSON.parse(data).endpoints
                for (var i in endpoints) {
                    if (endpoints[i].protocol == self.config.auth_ACS_S2SProtocol) {
                        if (self.config.logLevel >= 2) {
                            self.config.log('STS Endpoint found ' + endpoints[i].location)
                        }
                        return endpoints[i].location
                    }
                }
                throw "ACS endpoint not found"
            });
    };

    this.getAppOnlyAccessToken = function (
        targetPrincipalName,
        targetHost,
        targetRealm) {
        var self = this;
        var resource = helpers.getFormattedPrincipal(targetPrincipalName, targetHost, targetRealm)
        var clientId = helpers.getFormattedPrincipal(self.config.auth_clientId, "", targetRealm)

        var httpOptions = {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            form: {
                "grant_type": "client_credentials",
                "client_id": clientId,
                "client_secret": self.config.auth_clientSecret,
                "resource": resource
            }
        };

        if (self.config.logLevel >= 2) {
            self.config.log('Retreiving access token for ' + clientId)
        }
        return self.getStsUrl(self.config.auth_realm)
            .then(function (stsUrl) {
                return request.post(stsUrl, httpOptions)
                    .then(function (data) {
                        return JSON.parse(data)
                    })
            });
    }
}

authModule.prototype.connect = function (config, cb) {
    var self = this;
    this.config = assign(this.config, config);

    if (this.config.auth_clientId == null)
        cb('Missing config auth_clientId.', undefined);
    if (this.config.auth_clientSecret == null)
        cb('Missing config auth_clientSecret.', undefined);

    if (this.config.auth_realm == null) {
        helpers.getRealmFromTargetUrl(this.config.site, config.logLevel >= 3 ? config.log : undefined).then(realmFound);
    } else {
        realmFound(this.config.auth_realm);
    }

    function realmFound(realm) {
        self.config.auth_realm = realm;
        config.auth_realm = realm;

        if (config.tokenResponse) {
            self.tokenResponse = config.tokenResponse;
            cb(undefined, undefined);
        } else {
            self.getAppOnlyAccessToken(
                self.config.auth_ACS_sharePointPrincipal,
                url.parse(self.config.site).hostname,
                realm)
                .then(function (token) {
                    self.tokenResponse = token;
                    config.tokenResponse = token;
                    cb(undefined, undefined);
                })
                .catch(function (err) {
                    cb(err, undefined);
                });
        }
    };
}

authModule.prototype.getToken = function (cb) {
    if (this.tokenResponse) {
        //now() > toDateFromEpoch(tokens.expires_on)
        this.tokenResponse.accessToken = this.tokenResponse.access_token;
        cb(undefined, this.tokenResponse);
    } else {
        cb('Token is missing. Call connect.', undefined);
    }
}