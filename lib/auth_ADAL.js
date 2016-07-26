'use strict';
/**
 * Methods for ADAL authentication module.
 * 
 * @author Fabian-Schmidt
 */

var adal = require('adal-node');
var helpers = require('./auth_helpers');
var assign = require('object-assign');
var url = require('url');

module.exports = authModule;

function authModule() {
    this.config = {
        site: null,
        auth_realm: null,
        auth_ADAL_authorityHostUrl: 'https://login.windows.net',
        auth_username: null,
        auth_password: null,
        auth_clientId: 'd3590ed6-52b3-4102-aeff-aad2292ab01c',//ADAL Client Id of Office
        auth_clientSecret: null
    }
    this.tokenResponse = null;
}
authModule.prototype.AuthenticationContext = adal.AuthenticationContext;
authModule.prototype.configureLogging = function () {
    var self = this;
    var log = adal.Logging;
    log.setLoggingOptions(
        {
            level: self.config.logLevel,
            log: function (level, message, error) {
                self.config.log(message);
                if (error) {
                    self.config.log(error);
                }
            }
        });
}

authModule.prototype.connect = function (config, cb) {
    var self = this;
    this.config = assign(this.config, config);
    this.configureLogging();

    if (this.config.auth_realm == null) {
        helpers.getRealmFromTargetUrl(this.config.site, this.config.logLevel >= 3 ? this.config.log : undefined).then(realmFound);
    } else {
        realmFound(this.config.auth_realm);
    }
    
    function realmFound(realm) {
        self.config.auth_realm = realm;
        config.auth_realm = realm;
        var resource = 'https://' + url.parse(self.config.site).hostname + '/';

        var authorityUrl = self.config.auth_ADAL_authorityHostUrl + '/' + realm;
        var context = new self.AuthenticationContext(authorityUrl);

        if (self.config.tokenResponse) {
            tokenCallback(undefined, self.config.tokenResponse);
        } else {
            if (self.config.clientSecret != undefined) {
                context.acquireTokenWithClientCredentials(resource, self.config.auth_clientId, self.config.auth_clientSecret, tokenCallback);
            }
            else {
                context.acquireTokenWithUsernamePassword(resource, self.config.auth_username, self.config.auth_password, self.config.auth_clientId, tokenCallback);
                delete self.config.auth_password;
                delete config.auth_password;
            }
        }
    };
    function tokenCallback (err, tokenResponse) {
        if (err) {
            cb(err, undefined);
        } else {
            self.tokenResponse = tokenResponse;
            config.tokenResponse = tokenResponse;
            cb(undefined, undefined);
        }
    };
}

authModule.prototype.getToken = function (cb) {
    if (this.tokenResponse) {
        cb(undefined, this.tokenResponse);
    } else {
        cb('Token is missing. Call connect.', undefined);
    }
}