/* Copyright (c) 2009 The Chromium Authors. All rights reserved.
	 Use of this source code is governed by a BSD-style license that can be
	 found in the LICENSE file.
*/

/* Use only multi-line comments in this file, since during testing
	 its contents will get read from disk and stuffed into the
	 iframe .src tag, which is a process that doesn't preserve line
	 breaks and makes single-line comments comment out the rest of the code.
*/

/* The maximum number of feed items to show in the preview. */
/*var maxFeedItems = 10;*/

/* The maximum number of characters to show in the feed item title. */
/*var maxTitleCount = 64;*/


function id(x){ return document.getElementById(x); }
function el(tag, text, parent) {
	var e = document.createElement(tag);
	if(text)
		e.innerText = text;
	if(parent)
		parent.appendChild(e);
	return e;
}

/* Find the token and target origin for this conversation from the HTML. The
   token is used for secure communication, and is generated and stuffed into the
   frame by subscribe.js.
*/
var token = '';
var targetOrigin = '';
var html = document.documentElement.outerHTML;
var startTag = '<!--Token:';
var tokenStart = html.indexOf(startTag);
if (tokenStart > -1) {
  tokenStart += startTag.length;
  targetOrigin = html.substring(tokenStart, tokenStart+32);
  tokenStart += 32;
  var tokenEnd = html.indexOf('-->', tokenStart);
  if (tokenEnd > tokenStart)
    token = html.substring(tokenStart, tokenEnd);
}
 
if (token.length > 0) {
  var mc = new MessageChannel();
  window.parent.postMessage(
      token,
      'chrome-extension:/' + '/' + targetOrigin,
      [mc.port2]);
  mc.port1.onmessage = function(event) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(event.data, "text/xml");
    if (doc) {
      buildPreview(doc);
    } else {
      /* Already handled in subscribe.html */
    }
  }
}

function getLink(item){
	/* Grab the link URL. */
	var itemLink = item.getElementsByTagName('link');
	var link = "";
	if(itemLink.length > 0){
		link = itemLink[0];
		for(x=0; x<itemLink.length; x++){
			var attr=itemLink[x].getAttribute('rel');
			if(attr != 'self'){
				link=itemLink[x];
				if(!attr || attr == 'alternate')
					break;
			}
		}
		if(link.childNodes[0])
			link = link.childNodes[0].nodeValue;
		else
			link = link.getAttribute('href');
	}
	return link;
}


function getDescription(item, head){
	/* Grab the description.
		 TODO(aa): Do we need to check for type=html here? */
	var itemDesc;

	if(!head){
			itemDesc = item.getElementsByTagNameNS("http://purl.org/rss/1.0/modules/content/",'encoded')[0];
		if(!itemDesc){
			itemDesc = item.getElementsByTagName('description');
      if(itemDesc){
		itemDesc = itemDesc[0];
      }
		}
		if(!itemDesc)
			itemDesc = item.getElementsByTagName('content')[0];
		if(!itemDesc)
			itemDesc = item.getElementsByTagName('summary')[0];
	}
	else{
		itemDesc = item.getElementsByTagName('subtitle')[0];
	}
	if(!itemDesc)
		itemDesc = item.getElementsByTagName('description')[0];
	if(itemDesc)
		itemDesc = itemDesc.textContent;
	else
		itemDesc = "";
	
	return itemDesc;
}

NodeList.prototype.toArray = function(){ 
	var ary = []; 
	for(var i=0, len = this.length; i < len; i++){ 
		ary.push(this[i]); 
	} 
	return ary; 
}; 

function buildPreview(doc,feedUrl) {  
	var itemList = [];
	var divItems = document.createElement("div");
	divItems.className="items";

	/* Now parse the rest. Some use <entry> for each feed item, others use
		 <channel><item>. */
	var entries = doc.getElementsByTagName('entry');
	if (entries.length == 0)
		entries = doc.getElementsByTagName('item');

	for (i = 0; i < entries.length /*&& i < maxFeedItems*/; ++i) {
		item = entries.item(i);
		
		var itemDesc=getDescription(item,false);
		var divDesc = document.createElement("div");
		
		divDesc.className = "item-desc";
		divDesc.innerHTML = itemDesc;
		divDesc.summarize=function(){return this.textContent.split(" ",8).join(" ") + "...";};

		/* Grab the title for the feed item. */
		var itemTitle = item.getElementsByTagName('title')[0];
		if (itemTitle)
			itemTitle = itemTitle.textContent;
		/* if the feed has no title, we use a few words from the description */
		if (!itemTitle)
			itemTitle = divDesc.summarize();
		/* if the feed has no description, we take the title 
		as html for the description, and summarize for the title */
		if(!divDesc.innerHTML){
			divDesc.innerHTML=itemTitle;
			itemTitle = divDesc.summarize();
		}

		/* Ensure max length for title. */
		/*if (itemTitle.length > maxTitleCount)
			itemTitle = itemTitle.substring(0, maxTitleCount) + "...";*/

		var date = new Date(0-i);
		var pubDate = item.getElementsByTagName('pubDate')[0];
		if(!pubDate)
			pubDate = item.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/","date")[0];
		if(!pubDate)
			pubDate = item.getElementsByTagName("published")[0];
		if(!pubDate)
			pubDate = item.getElementsByTagName("updated")[0];
		if(pubDate && pubDate.textContent){
			date.setISO8601(pubDate.textContent);
			pubDate=date.toDateString()+" " +date.toLocaleTimeString();
		}
		else
			pubDate="";
		
		var pubAuth = item.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/","creator")[0];
		if(!pubAuth)
			pubAuth = item.getElementsByTagName("name")[0];
		if(!pubAuth)
			pubAuth = item.getElementsByTagName("author")[0];
		if(pubAuth)
			pubAuth=pubAuth.textContent;
		else
			pubAuth="";

		var link=getLink(item);

		var h2Title=document.createElement("h2");
		h2Title.className = "item-title";

		/* If we found a link we'll create an anchor element,
		otherwise just use a bold headline for the title. */
		var anchor = document.createElement("a");
		/*anchor.id = "anchor_" + String(i);*/
		if (link != "")
			anchor.href = link;
		/*anchor.appendChild(document.createTextNode(itemTitle));*/
		anchor.innerHTML=itemTitle;
		anchor.innerHTML=anchor.innerText;  /*magic de-html*/

		var spanOrdinal = document.createElement("span");
		spanOrdinal.className = "item-ordinal";
		spanOrdinal.innerHTML = String(i+1) + ". ";
		
		h2Title.appendChild(spanOrdinal);
		h2Title.appendChild(anchor);
		
		/* relative url fixes*/
		var chromeExt = new RegExp(/^chrome-extension:\/\/[^\/]*\//);
		
		imgUrlFix=divDesc.getElementsByTagName("img");
		for(x=0;x<imgUrlFix.length;x++){
			imgUrlFix[x].src=imgUrlFix[x].src.replace(chromeExt,"http://"+feedUrl.split("/")[2]+"/");
		}
		aUrlFix=divDesc.getElementsByTagName("a");
		for(x=0;x<aUrlFix.length;x++){
			aUrlFix[x].href=aUrlFix[x].href.replace(chromeExt,"http://"+feedUrl.split("/")[2]+"/");
		}
		
		if(window.localStorage.disableEmbed!="No"){
			var removetags=["object","embed","input","select","button","script","iframe","video","audio","style"];
			
			for(r in removetags){
				var obj = divDesc.getElementsByTagName(removetags[r]);
				for(x=0;x<obj.length;x++){
					/*obj[x].style.display="none";*/
					obj[x].parentNode.removeChild(obj[x]);
				}
			}
		}
		var obj = divDesc.getElementsByTagName("*");
		for(x=0;x<obj.length;x++){
			obj[x].style.textAlign="left";
			obj[x].style.float="none";
			obj[x].style.color=obj[x].color="";
			obj[x].style.margin="";
		}
		
		var imgMime = new RegExp("^image");
		var itemEncl = item.getElementsByTagName('enclosure');
		if(itemEncl.length){
			el('br','',divDesc);
			var divEncl = el("div","",divDesc);
			divEncl.className="item-enclosure";
			for(ie=0;ie<itemEncl.length;ie++){
				if(itemEncl[ie].getAttribute('type').match(imgMime)){
					/*convert enclosed images to plain img src tags*/
					var enc2Img=document.createElement('img');
					enc2Img.src=itemEncl[ie].getAttribute('url');
					divDesc.appendChild(enc2Img);
					continue;
				}
				var enclUrl=itemEncl[ie].getAttribute('url').split("/");
				enclUrl=enclUrl[enclUrl.length-1].replace(/\?.*$/,'');
				var len=parseInt(itemEncl[ie].getAttribute('length')/1024/10.24)/100;
				var aEncl = el('a',decodeURIComponent(enclUrl)
					+ (itemEncl[ie].getAttribute('type') ? (", " + itemEncl[ie].getAttribute('type')) : "") 
					+ (len?" (" + len + " MB)":""),divEncl);
				aEncl.setAttribute('title',decodeURIComponent(enclUrl));
				aEncl.setAttribute('href',itemEncl[ie].getAttribute('url'));
				var imgIcon=el('img','',aEncl);
				imgIcon.setAttribute('src',chrome.extension.getURL('enclosure.png'));
				imgIcon.className="icon-enclosure";
				aEncl.style.display="inline-block";
				el('br','',divEncl);
			}
		}
		/*
		<div class=""><a title="npr_122117046.mp3" href="http://podcastdownload.npr.org/anon.npr-podcasts/podcast/510284/122117046/npr_122117046.mp3"><img src="feedsummary_files/a">Enclosure</a> (13 MB)</div>
*/
			
		var divDate = document.createElement("div");
		divDate.className="item-pubDate";
		divDate.innerHTML=pubDate;
		
		var divAuth = document.createElement("div");
		divAuth.className="item-author";
		divAuth.innerHTML=pubAuth;
		
		var divItem = document.createElement("div");
		divItem.className="item";
		
		divItem.appendChild(h2Title);
		divItem.appendChild(divDesc);
		divItem.appendChild(divDate);
		divItem.appendChild(divAuth);
		divItem.date = date;
	
		itemList.push(divItem);
	}
	
	if(window.localStorage.sortFeeds=='Yes')
		itemList.sort(function(a,b){return b.date - a.date;});
	
	for(x = 0; x < itemList.length; x++)
		divItems.appendChild(itemList[x]);

	document.body.appendChild(divItems);
}

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

