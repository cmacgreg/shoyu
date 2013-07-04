/*
 * Copyright (c) 2013 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */

var reSubscribeLink = new RegExp(/chrome-extension:\/\/.*\/subscribe.html\?(.*)/);

var feedUnread = {'length': 0};
var listWidth = window.localStorage.listWidth ? parseInt(window.localStorage.listWidth) : 400;

var feeds;
var feedsLeft=0;
var noChanges;

function id(x){ return document.getElementById(x); }
function el(tag, text, parent) {
	var e = document.createElement(tag);
	if(text)
		e.innerText = text;
	if(parent)
		parent.appendChild(e);
	return e;
}

var port = chrome.extension.connect({name: "feedUpdate"});
port.onMessage.addListener(function(response) {	

	/* get the unread feed list, set style */
	if(response.msg=="feedUnread"){
		feedUnread=response.feedUnread;
			for(x in feedUnread){
				if(i=id("bookmark-id_"+x)){
					i.className=feedUnread[x];
				}
			}
		id('status').innerText = STAT_FEEDS;
		return;
	}
	
	/* demux any valid R-messages; className is the same as the response.msg.*/
	id("tick-id_"+response.node.id).style.display="none";
	id("bookmark-id_"+response.node.id).className=response.msg;
	
	if(response.msg.indexOf('updateNew') != -1)
		noChanges=false;
	
	feedsLeft--;
	if(!feedsLeft){
		id('status').textContent = noChanges?STAT_FEEDS+NO_CHANGES:STAT_FEEDS;
		id('updateButton').disabled = false;
	}
});

function updateFeeds(){
	feedsLeft=feeds.length;
	noChanges=true;
	
	for(x in feeds)
		id("tick-id_"+feeds[x].id).style.display="inline";

	port.postMessage({msg: "check", feeds: feeds});

	id('status').textContent = STAT_UPDATE;
	id('updateButton').disabled = true;
}

function main() {
	document.getElementById("updateButton").onclick = updateFeeds;
	id('status').textContent = STAT_LOAD;
		
	resizeMouseDown();
	
	if(defaultView != "browser"){
		var ep={};
		if(defaultView == "default")
			ep=defaultExtensionPath;
		else{
			ep[defaultView]=extensionPath;
			defaultView="default";
		}
		var testImg={};
		//compatible extension detection; 
		//false positive if the extension is unloaded but still in cache
		for(x in ep){
			testImg[x]=new Image();
			testImg[x].extName=x;
			testImg[x].src=ep[x]+"feed-icon-16x16.png";
			testImg[x].onload=function(){
				if(defaultView == "default"){
					viewSelect(this.extName,extensionPath);
				}
			};
		}
	}
	
	if(chrome.bookmarks)
		chrome.bookmarks.getTree(gotTree);
}

function pathToBookmark(treeChildren,path){
	/* recursively treats an array like a bookmark path
			expects bookmarkTree[0].children or similar */
	var p0=new RegExp("^"+path[0]+"$","i");
	for(y in treeChildren){
		if(treeChildren[y].title.match(p0)){
			if(path.length==1)
				return treeChildren[y];
			else
				return pathToBookmark(treeChildren[y].children,path.slice(1));
		}
	}
	return false;
}

function gotTree(bookmarkTree){
	feeds=[];
	var obf,sff; // 'other bookmarks' folder, shoyu feed folder
	var feedList = el('div','',id('content'));
	feedList.id=feedList.className="feedList";
	id('content').style.width=listWidth;
	
	/* obf is the parent of our feed folder
			we need it in case our folder hasn't been created yet */
	obf=pathToBookmark(bookmarkTree[0].children,folderName.slice(0,-1));
	if(!obf)
		obf=bookmarkTree[0].children[1];
	if(sff=pathToBookmark(obf.children,folderName.slice(-1)).children){	
		for(c in sff){
			if(!sff[c].url){
				//no subfolder support just yet
				continue;
			}
			
			if(r = sff[c].url.match(reSubscribeLink)){
				sff[c].url=decodeURIComponent(r[1]);
				if(chrome.bookmarks.update && window.localStorage.updateBookmarks=="Yes")
					chrome.bookmarks.update(sff[c].id,{url:sff[c].url});
			}
			
			
			var divItem=el('div','',feedList);
			divItem.className="divItem";
			var aItem = el('a', !sff[c].title? UNTITLED_FEED : sff[c].title, divItem);
			aItem.className="noupdate";
			aItem.bookmarkNode=sff[c];
			aItem.id = "bookmark-id_"+sff[c].id;
			aItem.href= sff[c].url;
			
			function onClick(a){
			
				var f = function(event){
					a.className="noupdate"; //remove extra style
							
					var feed=[a.bookmarkNode]; 
					port.postMessage({msg: "markRead", feeds: feed });
					/* the preceding check ensures the cached timestamp is that of
						the newest item when read, rather than last checked
						the result doesn't matter, as the popup should be gone already */
					
					preview(a.bookmarkNode.url);
				}
				return f;
			}
			
			divItem.addEventListener('click',onClick(aItem),false);
			
			feeds.push(sff[c]);	
			
			var spanTick = el('span',TICK_TEXT,divItem);
			spanTick.className="tick";
			spanTick.style.display="none";
			spanTick.id = "tick-id_"+sff[c].id;

		}
		
		feedList.style.display="block";
	
		port.postMessage({msg: "feedUnread", feeds: feeds});
		
	}
	else{
		//no feed folder; make one
		bookmarkFolderCreate(obf);
	}
	
}

function bookmarkFolderCreate(bookmarkParent){
	chrome.bookmarks.create({"parentId" : bookmarkParent.id, "title" : folderName.slice(-1)[0]}, nextCreate);
	function nextCreate(ourFolder){	
		var createLeft=defaultFeedList.length;
		for(x in defaultFeedList){
			chrome.bookmarks.create({'parentId' : ourFolder.id, 'url' : defaultFeedList[x].url, 'title' : defaultFeedList[x].title},
				function(){createLeft--; if(!createLeft) chrome.bookmarks.getTree(gotTree)});
		}
	}
}

function preview(url) {
	if(defaultView != "browser"){
		url = (defaultView != "default" ? window.localStorage.extensionPath : "") +
			"subscribe.html?" + encodeURIComponent(url);
	}	
	
	if(window.localStorage.openInCurrentTab == 'Yes'){
		chrome.tabs.getSelected(null,
			function(t){
				chrome.tabs.update(t.id,{ url:url },
					function(){
						window.close();
					});
			});
	}
	else{
		chrome.tabs.create({ url: url },
			function(){
				window.close();
			});
	}
	
}

function resizeMouseDown(){
	id('leftHandResize').onmousedown = function(){
		document.onselectstart = function(){return false;};
		document.onmousemove = drag;
		document.onmouseup = function(){ 
			id('heading').style.visibility='visible';
			id('feedList').className='feedList';
			document.onselectstart = function(){return true;};
			document.onmousemove = function(){}; 
			document.onmouseup = function(){}; 
		};
		return false;
	};
}

function drag(e){
	document.onmousemove = function(){};
	/* the chrome popup menu forces this odd left hand resize,
		chrome seems to have its own max size for popups, but
		our range is a bit smaller and defined in the stylesheet */
	listWidth-=e.clientX;
	id('content').style.width=listWidth+"px";
	//id('heading').style.visibility='hidden';
	id('feedList').className='feedListDrag';
	
	/* store the computed style size of content as the listWidth */
	listWidth=document.defaultView.getComputedStyle(id('content'), "").getPropertyValue("width").split('px',1)[0];
	window.localStorage.listWidth=listWidth;
	document.onmousemove = drag;
	return false;
}

window.onload = main;