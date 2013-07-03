/*
 * Copyright (c) 2010 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */

/* http://dansnetwork.com/2008/11/01/javascript-iso8601rfc3339-date-parser/ 
see also, http://www.ibm.com/developerworks/library/x-atom2json.html */

var reISO8601 = new RegExp(/(\d\d\d\d)(-)?(\d\d)(-)?(\d\d)(T)?(\d\d)(:)?(\d\d)(:)?(\d\d)(\.\d+)?(Z|([+-])?(\d\d)(:)?(\d\d))/);

Date.prototype.setISO8601 = function(dString){

	if (d = dString.toString().match(reISO8601)) {
		var offset = 0;

		this.setUTCDate(1);
		this.setUTCFullYear(parseInt(d[1],10));
		this.setUTCMonth(parseInt(d[3],10) - 1);
		this.setUTCDate(parseInt(d[5],10));
		this.setUTCHours(parseInt(d[7],10));
		this.setUTCMinutes(parseInt(d[9],10));
		this.setUTCSeconds(parseInt(d[11],10));
		if (d[12])
			this.setUTCMilliseconds(parseFloat(d[12]) * 1000);
		else
			this.setUTCMilliseconds(0);
		if (d[13] != 'Z') {
			offset = (d[15] * 60) + parseInt(d[17],10);
			offset *= ((d[14] == '-') ? -1 : 1);
			this.setTime(this.getTime() - offset * 60 * 1000);
		}
	}
	else {
		this.setTime(Date.parse(dString));
	}
	return this;
};

function getDate(item){
	var pubDate = item.getElementsByTagName('pubDate')[0];
	if(!pubDate)
		pubDate = item.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/","date")[0];
	if(!pubDate)
		pubDate = item.getElementsByTagName("published")[0];
	if(!pubDate)
		pubDate = item.getElementsByTagName("updated")[0];
	
	return pubDate;
}
