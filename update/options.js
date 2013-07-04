/*
 * Copyright (c) 2013 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */

var va;

function main(){
  document.getElementById("viewChoice").onclick = save;
  document.getElementById("customURL").onchange = save;

  document.getElementById('openInCurrentTab').onchange = function() {
    window.localStorage.openInCurrentTab
      = document.getElementById('openInCurrentTab').checked 
      ? 'Yes':'No';
  };

  document.getElementById('updateBookmarks').onchange = function() {
    window.localStorage.updateBookmarks
      = document.getElementById('updateBookmarks').checked 
      ? 'Yes':'No';
  };

	va=document['forms']['viewChoice']['defaultView'];
	for(x=0; x<va.length; x++){
		if(va[x].value == defaultView){
			va[x].checked=true;
			if(defaultView=="custom")
				document.getElementById('customURL').value=extensionPath;
			break;
		}
	}
	if(window.localStorage.openInCurrentTab == "Yes")
		document.getElementById('openInCurrentTab').checked=true;
	if(window.localStorage.updateBookmarks == "Yes")
		document.getElementById('updateBookmarks').checked=true;
}

function save(){
	for(x=0; x<va.length; x++){
		if(va[x].checked){
			viewSelect(va[x].value,document.getElementById('customURL').value);
			break;
		}
	}
}

window.onload = main;
