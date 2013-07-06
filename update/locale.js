/*
 * Copyright (c) 2010 Breakfast Kings. All rights reserved.  Use of this
 * source code is governed by a BSD-style license that can be found in the
 * LICENSE file.
 */
 
//this stuff is dumped here pending true internationalization

var STAT_LOAD = "Loading...";
var STAT_UPDATE = "Updating...";
var STAT_FEEDS = "Feeds:";
var NO_CHANGES = " (no new updates)";
var UNTITLED_FEED = "(untitled)";
var TICK_HTML = "&bull;";

var _ttdiv = document.createElement('div');
_ttdiv.innerHTML = TICK_HTML;
var TICK_TEXT = _ttdiv.firstChild.nodeValue;

var folderName = ["Other bookmarks", "Shoyu feeds"];

var defaultFeedList = [ {
	"title": "BBC News | News Front Page | World Edition",
	 "url": "http://news.bbc.co.uk/rss/newsonline_world_edition/front_page/rss091.xml"
	}, {
	 "title": "FOXNews.com",
	 "url":"chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/subscribe.html?http%3A%2F%2Fwww.foxnews.com%2Fxmlfeed%2Frss%2F0%2C4313%2C0%2C00.rss"
	}, {
	 "title": "The Economist: Full print edition",
	 "url": "http://www.economist.com/rss/full_print_edition_rss.xml"
	}, {
	 "title": "NYT > Magazine",
	 "url": "http://graphics8.nytimes.com/services/xml/rss/nyt/Magazine.xml"
	}, {
	 "title": "Boing Boing",
	 "url": "http://feeds.boingboing.net/boingboing/iBag"
	}, {
	 "title": "Gizmodo",
	 "url": "http://gizmodo.com/index.xml"
	}, {
	 "title": "Schneier on Security",
	 "url": "http://www.schneier.com/blog/index.xml"
	}, {
	 "title": "Wired: Threat Level",
	 "url": "http://feeds.wired.com/wired27b"
	}/*, {
	 "title": "Twitter / ladygaga",
	 "url": "chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/subscribe.html?http%3A%2F%2Ftwitter.com%2Fstatuses%2Fuser_timeline%2F14230524.rss"
	}, {
	 "title": "Twitter / cmacgreg",
	 "url": "chrome-extension://ilicaedjojicckapfpfdoakbehjpfkah/subscribe.html?http%3A%2F%2Ftwitter.com%2Fstatuses%2Fuser_timeline%2F101410489.rss"
	}*/ ];
	
	
	