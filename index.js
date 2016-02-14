'use strict';
const assign = require('object-assign');

module.exports = SharePointSync;

function SharePointSync( config ) {

	this.config = assign( {
		parallel:       3,
		maxConnections: config.parallel || 5,
		log:            null,
        logLevel:       1,//0-ERROR, 1-WARNING, 2-INFO, 3-VERBOSE
		timeOffset:     0,
		idleTimeout:    100,
        authenticationMethod: 'ADAL',//ADAL, ACS
		reload:         false
	}, config );

	// connection pool
	this.queue = [];
	this.connectionCount = 0;
	this.idle = [];
	this.idleTimer = null;

}

SharePointSync.create = function ( config ) {
	return new SharePointSync( config );
};

assign(
	SharePointSync.prototype,
	// require( './lib/glob' ),
	require( './lib/filter' ),
	// require( './lib/src' ),
	require( './lib/dest' ),
	require( './lib/delete' ),
    require( './lib/connection' ),
	require( './lib/helpers' )
);