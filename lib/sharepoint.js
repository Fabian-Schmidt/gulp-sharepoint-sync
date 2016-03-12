'use strict';
/**
 * Simulate a FTP connection to SharePoint OData.
 * 
 * @author Fabian-Schmdit
 */
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var requestpromise = require('request-promise');
var Auth_ACS = require('./auth_ACS');
var Auth_ADAL = require('./auth_ADAL');
var url = require('url');
var promise = require('bluebird');
var Path = require('path');
var timezone = require('timezone');
var mime = require('mime');

module.exports = SharePoint;
//capsule all http requests.
//input file
function SharePoint() {
    this.authModule = null;
    this.config = null;
    this.serverRelativeUrl = null;
}
inherits(SharePoint, EventEmitter);
var waitForConnect = false;
var waitingTasks = [];

SharePoint.prototype.connect = function (config) {
    var self = this;
    this.config = config;
    if (this.config.authenticationMethod == 'ACS') {
        this.authModule = new Auth_ACS();
    } else if (this.config.authenticationMethod == 'ADAL') {
        this.authModule = new Auth_ADAL();
    } else {
        self.emit('error', 'Unkown config authenticationMethod "' + config.authenticationMethod + '".');
    }

    if (self.config.site == null)
        self.emit('error', 'Missing config site.');
    //Ensure '/' at the end.
    if (self.config.site[self.config.site.length - 1] != '/')
        self.config.site += '/';
    self.serverRelativeUrl = url.parse(self.config.site).pathname;
    //Remove '/' at the end.
    self.serverRelativeUrl = self.serverRelativeUrl.substring(0, self.serverRelativeUrl.length - 1);

    if (waitForConnect) {
        waitingTasks.push(connectTask);
    } else {
        waitForConnect = true;
        connectTask();
    }
    function connectTask() {
        self.authModule.connect(self.config, function (err, result) {
            waitForConnect = false;
            if (err) {
                self.emit('error', err);
            } else {
                self.emit('ready');
            }
            while (waitingTasks.length > 0) {
                waitingTasks.pop()();
            }
        });
    }
}

SharePoint.prototype.end = function () {
    //this.config.log('end');
}

SharePoint.prototype.list = function (path, cb) {
    var self = this;

    this.authModule.getToken(function (err, token) {
        if (err) {
            cb(err, undefined);
            return;
        }
        var headers = {
            "headers": {
                "Authorization": "Bearer " + token.accessToken,
                "content-type": "application/json;",
                "Accept": "application/json;"
            }
        };

        var folders = requestpromise.get(
            self.config.site + "_api/Web/GetFolderByServerRelativeUrl('" + self.serverRelativeUrl + path + "')/Folders?$select=Name,TimeCreated,TimeLastModified",
            headers);
        var files = requestpromise.get(
            self.config.site + "_api/Web/GetFolderByServerRelativeUrl('" + self.serverRelativeUrl + path + "')/Files?$select=Name,TimeCreated,TimeLastModified,Length",
            headers);
        promise.all([folders, files])
            .then(function (success) {
                var folders = JSON.parse(success[0]);
                var files = JSON.parse(success[1]);
                if (self.config.logLevel >= 2) {
                    self.config.log('LIST  ' + path + ': ' + folders.value.length + ' folder(s), ' + files.value.length + ' file(s).')
                }

                var parsed = [];
                folders.value.forEach(function (currentValue, index, array) {
                    parsed.push({
                        name: currentValue.Name,
                        date: timezone(currentValue.TimeLastModified),
                        size: 0,
                        type: 'd'
                    });
                });
                files.value.forEach(function (currentValue, index, array) {
                    parsed.push({
                        name: currentValue.Name,
                        date: timezone(currentValue.TimeLastModified),
                        size: parseInt(currentValue.Length),
                        type: ''
                    });
                });
                if (self.config.logLevel >= 3) {
                    self.config.log(parsed);
                }
                cb(undefined, parsed);
            })
            .catch(cb);
    });
}

SharePoint.prototype.mkdir = function (path, cb) {
    var self = this;
    this.authModule.getToken(function (err, token) {
        if (err) {
            cb(err, undefined);
            return;
        }
        var headers = {
            "headers": {
                "Authorization": "Bearer " + token.accessToken,
                "content-type": "application/json;",
                "Accept": "application/json;"
            }
        };
        var existingFolder = Path.dirname(path);
        var newFolder = Path.basename(path);
        requestpromise.post(
            self.config.site + "_api/Web/GetFolderByServerRelativeUrl('" + self.serverRelativeUrl + existingFolder + "')/Folders/add(url='" + newFolder + "')",
            headers)
            .then(function (success) {
                if (self.config.logLevel >= 4) {
                    self.config.log(JSON.parse(success));
                }
                cb(undefined, undefined);
            })
            .catch(cb);
    });
}

SharePoint.prototype.put = function (input, path, cb) {
    var self = this;


    var isBuffer = Buffer.isBuffer(input);

    if (!isBuffer && input.pause !== undefined)
        input.pause();

    this.authModule.getToken(function (err, token) {
        if (err) {
            cb(err, undefined);
            return;
        }
        
        var data = '';
        input.on('data', function (chunk) {
            data += chunk;
        });
        input.resume();
        input.on('end', uploadFile);
        
        // if (isBuffer)
        //     this.config.log('isBuffer');
        // //dest.end(input);
        // else if (typeof input === 'string') {
        //     // check if input is a file path or just string data to store
        //     fs.stat(input, function (err, stats) {
        //         if (err)
        //             this.config.log('put error');
        //         //dest.end(input);
        //         else
        //             this.config.log('createReadStream');
        //         //fs.createReadStream(input).pipe(dest);
        //     });
        // } else {
        //     this.config.log('resume');
        //     //input.pipe(dest);
        //     //input.resume();
        // }

        function uploadFile() {
            var folder = Path.dirname(path);
            var filename = Path.basename(path);
            
            var mimeType = mime.lookup(filename);
            
            var headers = {
                "headers": {
                    "Authorization": "Bearer " + token.accessToken,
                    "Content-Type": mimeType + ";",
                    "Accept": "application/json;"
                },
                "body": data
            };
            
            requestpromise.post(
                self.config.site + "_api/Web/GetFolderByServerRelativeUrl('" + self.serverRelativeUrl + folder + "')/Files/add(url='" + filename + "',overwrite=true)",
                headers)
                .then(function (success) {
                    if (self.config.logLevel >= 4) {
                        self.config.log(JSON.parse(success));
                    }
                    cb(undefined);
                })
                .catch(function (err) {
                    switch (err.statusCode) {
                        case 423:
                            cb("Unable to upload file, it might be checked out to someone")
                            break;
                        default:
                            cb(err);
                            break;
                    }
                });
        }
    });
}

SharePoint.prototype.delete = function (path, cb) {
    var self = this;
    this.authModule.getToken(function (err, token) {
        if (err) {
            cb(err, undefined);
            return;
        }
        var headers = {
            "headers": {
                "Authorization": "Bearer " + token.accessToken,
                "content-type": "application/json;",
                "Accept": "application/json;"
            }
        };

        requestpromise.post(
            self.config.site + "_api/Web/GetFileByServerRelativeUrl('" + self.serverRelativeUrl + path + "')/Recycle()",
            headers)
            .then(function (success) {
                if (self.config.logLevel >= 4) {
                    self.config.log(JSON.parse(success));
                }
                cb(undefined);
            })
            .catch(cb);
    });
};

SharePoint.prototype.rmdir = function (path, recursive, cb) {
    var self = this;
    this.authModule.getToken(function (err, token) {
        if (err) {
            cb(err, undefined);
            return;
        }
        var headers = {
            "headers": {
                "Authorization": "Bearer " + token.accessToken,
                "content-type": "application/json;",
                "Accept": "application/json;"
            }
        };

        requestpromise.post(
            self.config.site + "_api/Web/GetFolderByServerRelativeUrl('" + self.serverRelativeUrl + path + "')/Recycle()",
            headers)
            .then(function (success) {
                if (self.config.logLevel >= 4) {
                    self.config.log(JSON.parse(success));
                }
                cb(undefined);
            })
            .catch(cb);
    });
};