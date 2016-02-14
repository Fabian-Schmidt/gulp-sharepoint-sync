'use strict';
/**
 * Helper methods for ADAL and ACS authentication module.
 * This is mostly copied from https://github.com/wictorwilen/gulp-spsync
 * Original Copyright Wictor Wilén
 *
 * @author wictorwilen
 */
const request = require('request-promise');

module.exports = {
     getRealmFromTargetUrl: function(targetUrl, log){
         if (log)
            log('Locating realm for ' + targetUrl)
		
		return request.post( targetUrl + "vti_bin/client.svc",{
			headers: {
				"Authorization": "Bearer "
			},
			resolveWithFullResponse: true
		}).then(function(response){
			throw "Unexpected"
		}).catch(function(err){
			if(err.name== 'RequestError'){
				throw "Request error"
			}
			var headers = err.response.headers	
			var data = headers["www-authenticate"]
            var bearer = "Bearer realm=\"";
			var ix  = data.indexOf(bearer)	+ bearer.length
			data = data.substring(ix, ix+36)
            if (log)
                log('Realm is ' + data)

			return data; 
		});
	},
    getFormattedPrincipal: function (principalName, hostName, realm){
		var resource = principalName
		if(hostName != null && hostName != "" ) {
			resource += "/" + hostName 	
		} 
		resource += "@" + realm
		return resource
	},
     toDateFromEpoch:function(epoch){
  		var tmp = parseInt(epoch); 
		if(tmp<10000000000) tmp *= 1000;	
		var d = new Date()
		d.setTime(tmp)
		return d;
	},
	 now: function() {
		return new Date()
	}
}