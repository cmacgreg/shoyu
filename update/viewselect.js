/*
 * Copyright (c) 2010 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */
 
var defaultView=window.localStorage.defaultView?window.localStorage.defaultView:"default";
var extensionPath=window.localStorage.extensionPath?window.localStorage.extensionPath:"";
var defaultExtensionPath = {
	'shoyu': 'chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/',
	'google': 'chrome-extension://nlbjncdgjeocebhnmkbbbdekmmmcbfjd/',
	'default': '',
};

function viewSelect(v,customURL){
	window.localStorage.defaultView=defaultView=v;
	switch(v){
		case 'browser':
			delete window.localStorage.extensionPath;
			break;
		case 'custom':
			window.localStorage.extensionPath=extensionPath=customURL;
			break;
		default:
			window.localStorage.extensionPath=extensionPath=defaultExtensionPath[v];
	}
}
