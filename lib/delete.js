/**
 * This is mostly copied from https://github.com/morris/vinyl-ftp
 * Original Copyright Morris Brodersen
 * 
 * @author morris
 */

module.exports = {

	delete: function ( path, cb ) {

		var self = this;
		var rel;

		this.acquire( onAcquire );

		function onAcquire( err, ftp ) {

			rel = ftp;
			if ( err ) return final( err );

			self.log( 'DEL  ', path );
			ftp.delete( path, final );

		}

		function final( err ) {

			self.release( rel );
			cb( err );

		}

	},

	rmdir: function ( path, cb ) {

		var self = this;
		var rel;

		this.acquire( onAcquire );

		function onAcquire( err, ftp ) {

			rel = ftp;
			if ( err ) return final( err );

			self.log( 'RMDIR', path );
			ftp.rmdir( path, true, final );

		}

		function final( err ) {

			self.release( rel );
			cb( err );

		}

	}

};