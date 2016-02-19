# gulp-sharepoint-sync
Upload files to a SharePoint Online (Office 365) library.

Supports three authentication methods:
 - Username and Password (ADAL)
 - Client Id and Secret from Azure Active Directory (ADAL)
 - Client Id and Secret from SharePoint Online (ACS)

# Usage with Username and Password

1. Install NPM packages: `npm install gulp gulp-util Fabian-Schmidt/gulp-sharepoint-sync inquirer`
2. Create `gulpfile.js` and insert gulp script:

```javascript
var gulp = require( 'gulp' );
var gutil = require( 'gulp-util' );
var spSync = require( 'Fabian-Schmidt/gulp-sharepoint-sync' );
var inquirer = require('inquirer');

var spSync_Connection;

gulp.task('deploy', function (done) {
    inquirer.prompt({
		type: 'password',
		name: 'pass',
		message: 'Please enter your password'
	}, function(answers) {
        spSync_Connection = spSync.create({
            site:'https://foo.sharepoint.com/sites/bar/',
            authenticationMethod: 'ADAL',
            auth_username: 'admin@foo.onmicrosoft.com',
            auth_password: answers.pass,
            parallel: 5,
            log:      gutil.log,
            logLevel: 2
        });
        
        gulp.start('uploadFiles');
        done();
    });
});

gulp.task('uploadFiles', function() {
    var globs = [
            'src/**',
            'css/**',
            'js/**',
            'fonts/**',
            'index.html'
        ];
    // using base = '.' will transfer everything to /public_html correctly
    // turn off buffering in gulp.src for best performance
    return gulp.src( globs, { base: '.', buffer: false } )
        //.pipe(watch(globs))
        .pipe( spSync_Connection.differentSize( '/images/public_html' ) ) // only upload newer files
        .pipe( spSync_Connection.dest( '/images/public_html' ) );
    });
});
```


# Usage with Client Id and Secret from SharePoint Online (ACS)

1. Prepare SharePoint by registering a SharePoint app using appregnew.aspx. Eg go to `https://contoso.sharepoint.com/sites/site/_layouts/15/appregnew.aspx`
2. Click on `Generate` for both Client Id and Client Secret. For Title, App Domain and Redirect URI, write something you don't care about. Then click on `Create`
3. Note down the `Client Id` and `Client Secret`, you will need it later
4. Navigate to appinv.aspx, `https://contoso.sharepoint.com/sites/site/_layouts/15/appinv.aspx`, enter the client ID in the App Id box and press Lookup
5. In the Permission Request XML text box enter the following XML and click Create (Note: `FullControl` is required to update assets in the Master Page gallery)  
```xml
<AppPermissionRequests AllowAppOnlyPolicy="true">
    <AppPermissionRequest
        Scope="http://sharepoint/content/sitecollection/web"
        Right="FullControl"/>
</AppPermissionRequests>
```
6. In the following consent screen choose to trust the App by clicking on Trust It!
7. Install NPM packages: `npm install gulp gulp-util Fabian-Schmidt/gulp-sharepoint-sync inquirer`
8. Create `gulpfile.js` and insert gulp script:

```javascript
var gulp = require( 'gulp' );
var gutil = require( 'gulp-util' );
var spSync = require( 'Fabian-Schmidt/gulp-sharepoint-sync' );

gulp.task('deploy', function () {
    var conn = spSync.create({
        site:'https://foo.sharepoint.com/sites/bar/',
        authenticationMethod: 'ADAL',
        auth_clientId: '8b1632b1-abcd-ef12-8c19-3b5408408009',
        auth_clientSecret: 'OTsnkhxSa3U5hwhofe3pK1Y2tldIyOnnApHOmGmgtFc=',
        parallel: 5,
        log:      gutil.log,
        logLevel: 2
    });
    
    var globs = [
            'src/**',
            'css/**',
            'js/**',
            'fonts/**',
            'index.html'
        ];
    // using base = '.' will transfer everything to /public_html correctly
    // turn off buffering in gulp.src for best performance
    return gulp.src( globs, { base: '.', buffer: false } )
        //.pipe(watch(globs))
        .pipe( conn.differentSize( '/images/public_html' ) ) // only upload newer files
        .pipe( conn.dest( '/images/public_html' ) );
    });
});
```

# API
`var spSync = require( 'Fabian-Schmidt/gulp-sharepoint-sync' )`

### spSync.create( config )

Return a new `sharepoint-sync` instance with the given config. Config options:

- __site:__        SharePoint Online site (required)
- __auth_realm:__   Office 365 authentication realm (optinal)
- __authenticationMethod:__ Authentication form: `ADAL` or `ACS`, default is ADAL
- __auth_username:__ Authentication user (ADAL authentication only)
- __auth_password:__ Authentication password (ADAL authentication only)
- __auth_clientId:__ Authentication client id (ADAL or ACS authentication)
- __auth_clientSecret:__ Authentication client secret (ADAL or ACS authentication)
- __log:__         Log function, default is null
- __parallel:__    Number of parallel transfers, default is 3
- __maxConnections:__ Maximum number of connections, should be greater or equal to "parallel". Default is 5, or the parallel setting.
- __reload:__      Clear caches before (each) stream, default is false

You can override `parallel` and `reload` per stream in their `options`.

### conn.dest( remoteFolder[, options] )

Returns a transform stream that transfers input files to a remote folder.
All directories are created automatically.
Passes input files through.

### conn.newer( remoteFolder[, options] )

Returns a transform stream which filters the input for files
which are newer than their remote counterpart.

### conn.differentSize( remoteFolder[, options] )

Returns a transform stream which filters the input for files
which have a different file size than their remote counterpart.

### conn.newerOrDifferentSize( remoteFolder[, options] )

See above.

### conn.filter( remoteFolder, filter[, options] )

Returns a transform stream that filters the input using a callback.
The callback should be of this form:

```javascript
function ( localFile, remoteFile, callback ) {

	// localFile and remoteFile are vinyl files.
	// Check remoteFile.ftp for remote information.
	// Decide wether localFile should be emitted and call callback with boolean.
	// callback is a function( error, emit )

	callback( null, emit );

}
```

### conn.delete( path, cb )

Deletes a file.

### conn.rmdir( path, cb )

Removes a directory, recursively.


