/*
 * Copyright (c) 2013 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */

var ICON_UNREAD = "shoyu-icon-128x128.png";
var ICON_NO_UNREAD = "shoyu-icon-128x128-no-unread.png"

var feedDate = window.localStorage.feedDate ? JSON.parse(window.localStorage.feedDate) : {}; 
var feedUnread = new feedUnreadList(window.localStorage.feedUnread ? JSON.parse(window.localStorage.feedUnread) : {}); 

function feedUnreadList(l){
	this.init = function(){
		this.noUpdates=true;
		this.length=0;
		for(x in this){
			if(x == parseInt(x)){
				this.length++
				if(this[x] && this[x].indexOf('update') != -1)
					this.noUpdates=false;
			}
		}
	};
	this.refresh = function(){
		this.init();
		chrome.browserAction.setIcon({path: this.noUpdates ? ICON_NO_UNREAD : ICON_UNREAD});
		window.localStorage.feedUnread = JSON.stringify(this);
	};
	for(x in l)
		this[x]=l[x];
	this.init();
}

feedDate.store = function() { window.localStorage.feedDate = JSON.stringify(this); } ;

function onLoad(){
	
	var msg;
	if(this.updated){
		msg="update";
	}
	else{
		if(!this.responseXML){
			feedUnread[this.node.id]=msg="error";
		}
		else{
			msg = "noupdate";
			delete feedUnread[this.node.id];
			
			var currentDate = new Date(feedDate[this.node.url] ? feedDate[this.node.url] : 0);
			var localDate = currentDate;
			
			var doc = this.responseXML.documentElement;
			var items = doc.getElementsByTagName('entry');
			if(!items.length)
				items = doc.getElementsByTagName('item');
			for(var x=0; x<items.length; x++){	
				var item=items[x];

				var pubDate = getDate(item);
				//this.getResponseHeader("Last-Modified");
				if(!pubDate)
					continue;
				
				var date = new Date();
				date.setISO8601(pubDate.textContent);
				//console.log("shoyu update: "+ x + ": " + date.getTime());
				if(date > localDate){
					localDate=date;
					//console.log("shoyu update: "+ ">: " + localDate.getTime());
				}
			}
			if(localDate > currentDate){
				if(!this.markRead){
					feedUnread[this.node.id]="update";
					msg="updateNew";
				}
				//console.log("shoyu updateNew, id:" + this.node.id + " url:" + this.node.url + " date0:" + currentDate.getTime() + " date1:" + localDate.getTime() );
				feedDate[this.node.url] = localDate.getTime();
			}
		}
	
		feedUnread.refresh();
		feedDate.store();
	}
	this.port.postMessage({msg: msg, node: this.node});

}

chrome.extension.onConnect.addListener(function(port){
	console.assert(port.name == "feedUpdate");
	port.onMessage.addListener(function(req){
		if(req.msg == "feedUnread"){
			port.postMessage({msg: "feedUnread", feedUnread: feedUnread});
		}
		else if(req.msg == "check" || req.msg == "markRead"){
			var feedUnreadNew=new feedUnreadList();
			for(y in req.feeds){
				var node=req.feeds[y];
				
				var xhr;
				xhr = new XMLHttpRequest();
				xhr.port=port;
				xhr.node=node;
				xhr.onload=onLoad;
				xhr.onerror=onLoad;
				
				if(req.msg == "markRead")
					xhr.markRead = true;
				else if(feedUnread[node.id]){
					feedUnreadNew[node.id] = feedUnread[node.id];
					if(feedUnread[node.id].indexOf('update') != -1){
						xhr.updated = true;
						xhr.onload();
						continue;
					}
				}
				xhr.overrideMimeType('text/xml');
				xhr.open("GET", node.url, true);
				xhr.send(null);
		
			}
			if(req.msg != "markRead"){
				feedUnread=feedUnreadNew;
				feedUnread.refresh();
			}
		}
	});
});