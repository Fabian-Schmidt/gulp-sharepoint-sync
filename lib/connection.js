'use strict';
/**
 * This is mostly copied from https://github.com/morris/vinyl-ftp
 * Original Copyright Morris Brodersen
 *
 * @author morris
 */

var Stream = require('stream');
var Path = require('path');
var Vinyl = require('vinyl');
var SharePoint = require('./sharepoint');
var Cache = require('./cache');

module.exports = {
    upload: function (file, path, cb) {
        var self = this;

        var stream = new Stream.PassThrough();
        if (file.isNull()) {
            if (file.stat && file.stat.isDirectory()) this.mkdirp(path, cb);
            else cb(null, file);
            return;
        }

        file.pipe(stream, { end: true });
        // ensure that parent directory exists
        self.mkdirp(Path.dirname(path), onParent);

        function onParent(err) {
            if (err) return final(err);
            self.acquire(onAcquire);
        }

        var rel;

        function onAcquire(err, ftp) {
            rel = ftp;
            if (err) return final(err);
            self.log('PUT  ', path);
            ftp.put(stream, path, final);

//             // THE FOLLOWING MUST BE AFTER ftp.put()
//             // Somehow, if you attach a 'data' handler before
//             // ftp.put, the callback of ftp.put is never called
//             if (file.stat) {
//                 var uploaded = 0;
//                 var size = file.stat.size;
// 
//                 stream.on('data', function (chunk) {
// 
//                     uploaded += chunk.length;
// 
//                     var progress = Math.floor(uploaded / size * 100).toString();
//                     if (progress.length === 1) progress = '  ' + progress;
//                     if (progress.length === 2) progress = ' ' + progress;
// 
//                     self.log('UP   ', progress + '% ' + path);
// 
//                 });
// 
//             }

        }

        function final(err) {

            self.release(rel);
            cb(err, file);

        }
    },

    mkdirp: function (path, cb) {
        if (!this._mkdirp) {
            var self = this;

            this._mkdirp = new Cache(function (path, cb) {

                // skip if path is root
                if (path === '/' || path === '') {

                    return final();

                }

                self.remote(path, onRemote);

                function onRemote(err, remote) {

                    if (err) return final(err);
                    if (remote && !self.isDirectory(remote)) return final(new Error(path + ' is a file, cannot MKDIR'));
                    if (remote) return final(); // skip if exists

                    // ensure that parent directory exists
                    self.mkdirp(Path.dirname(path), onParent);

                }

                function onParent(err) {

                    if (err) return final(err);
                    self.acquire(onAcquire);

                }

                var rel;

                function onAcquire(err, ftp) {

                    rel = ftp;
                    if (err) return final(err);

                    self.log('MKDIR', path);
                    ftp.mkdir(path, final);

                }

                function final(err) {

                    self.release(rel);
                    cb(err);

                }

            });

        }

        path = this.join('/', path);
        return this._mkdirp.get(path, cb);
    },

    remote: function (path, cb) {

        var self = this;
        path = this.join('/', path);
        var basename = Path.basename(path);
        var dirname = Path.dirname(path);

        self.list(dirname, onFiles);

        function onFiles(err, files) {

            if (err) return cb(err);

            for (var i = 0; i < files.length; ++i) {

                if (files[i].ftp.name === basename) return cb(null, files[i]);

            }

            cb();

        }

    },

    list: function (path, cb) {

        if (!this._list) {

            var self = this;

            this._list = new Cache(function (path, cb) {

                var rel;

                self.acquire(onAcquire);

                function onAcquire(err, ftp) {

                    rel = ftp;
                    if (err) return final(err);

                    self.log('LIST ', path);
                    ftp.list(path, onFiles);

                }

                function onFiles(err, files) {

                    // no such file or directory
                    if (err && (err.code === 550 || err.code === 450)) return final(null, []);
                    if (err) return final(err);

                    final(null, self.vinylFiles(path, files));

                }

                function final(err, files) {

                    self.release(rel);
                    cb(err, files);

                }

            });

        }

        path = this.join('/', path);
        this._list.get(path, cb);

    },

    vinylFiles: function (dirname, files) {

        var self = this;

        return files.filter(function (file) {

            return file.name !== '.' && file.name !== '..';

        }).map(function (file) {

            file.date = self.fixDate(file.date);

            var vinyl = new Vinyl({
                cwd: '/',
                path: self.join(dirname, file.name)
            });
            vinyl.ftp = file;

            return vinyl;

        });

    },

    acquire: function (cb) {

        if (this.idle.length > 0) {

            cb(null, this.idle.shift());

        } else if (this.connectionCount < this.config.maxConnections) {

            this.log('CONN ');

            var self = this;
            var ftp = new SharePoint();
            var called = false;
            ++this.connectionCount;

            ftp.on('ready', function () {

                self.log('READY');
                called = true;
                cb(null, ftp);

            });

            ftp.on('error', function (err) {

                var code = err.code ? (' (' + err.code + ')') : '';
                self.log('ERROR', err.stack + code);
                self.release(ftp, true);

                // only enqueue callback if not called yet
                if (!called) {

                    called = true;

                    if (self.connectionCount === 0) {

                        // there's no hope that a working connection will be released
                        // pass error
                        return cb(err);

                    }

                    self.queue.push(cb);

                }

            });

            ftp.connect(this.config);

        } else {

            this.queue.push(cb);

        }

    },
    release: function (ftp, force) {

        if (!ftp) return;

        if (force) {

            this.log('DISC ');
            ftp.end();
            --this.connectionCount;

        } else if (this.queue.length > 0) {

            var first = this.queue.shift();
            first(null, ftp);

        } else {

            this.pushIdle(ftp);

        }

    },

    reload: function () {

        if (this._mkdirp) this._mkdirp.clear();
        if (this._mlsd) this._mlsd.clear();
        if (this._list) this._list.clear();

    },

    pushIdle: function (ftp) {

        var self = this;

        // add connection to idle list
        this.idle.push(ftp);

        // reset any earlier timeout
        clearTimeout(this.idleTimer);

        // disconnect all after timeout
        this.idleTimer = setTimeout(function () {

            self.idle.forEach(function (ftp) {

                self.log('DISC ');
                ftp.end();
                --self.connectionCount;

            });

            self.idle = [];

        }, this.config.idleTimeout);

    }
}