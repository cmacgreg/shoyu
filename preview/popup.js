function feedLink(url) {
  var feed_link = document.createElement('a');
  feed_link.href = url;
  feed_link.addEventListener("click", function(){ preview(url)});
  return feed_link;
}

function main() {
  chrome.tabs.getSelected(function(tab) {
    chrome.storage.local.get(tab.id.toString(), function(result) {
      var feeds = result[tab.id];

      if (feeds.length == 1) {
        // Only one feed, no need for a bubble; go straight to the subscribe page.
        preview(feeds[0].href);
      } else {
        var content = document.getElementById('content');
        var heading = document.getElementById('heading');
        //heading.innerText = "Discovered " + feeds.length + " site feeds:"; //jumpiness from length? FIXME, prolly td-related
        heading.innerText = "Discovered feeds:";
        content.appendChild(document.createElement('br'));

        var feed_list = document.createElement('table');
        feed_list.style.width = "400";
        for (var i = 0; i < feeds.length; ++i) {
          // Create an RSS image and the anhor encapsulating it.
          var img_link = feedLink(feeds[i].href);
          var img = document.createElement('img');
          img.src = "feed-icon-16x16.png"
          img_link.appendChild(img);

          // Create a text node and the anchor encapsulating it.
          var text_link = feedLink(feeds[i].href);
          text_link.appendChild(document.createTextNode(feeds[i].title));

          // Add the data to a row in the table.
          var tr = document.createElement('tr');
          tr.className = "feedList";
          var td = document.createElement('td');
          td.width = "16";
          td.appendChild(img_link);
          var td2 = document.createElement('td');
          td2.appendChild(text_link);
          tr.appendChild(td);
          tr.appendChild(td2);
          feed_list.appendChild(tr);
        }

        content.appendChild(feed_list);
      }
    });
  });
}

function preview(feed_url) {
	// See if we need to skip the preview page and subscribe directly.
	if (window.localStorage && window.localStorage.showPreviewPage == "No") {
		// Skip the preview.
		var read_url = window.localStorage.defaultReader.replace("%s",encodeURIComponent(feed_url));
		feed_url=read_url.replace( "%f", feed_url.replace( "http:", "feed:" ));
		if(feed_url!=read_url){
			feed_url = "subscribe.html?" + encodeURIComponent(feed_url) + "&force";
			chrome.windows.create({url:feed_url}); //why not a tab here?
		}
		else{
			chrome.tabs.create({ url: read_url });
		}
	}
	else{
		feed_url = "subscribe.html?" + encodeURIComponent(feed_url);
		chrome.tabs.create({ url: feed_url });
	}
}

document.addEventListener('DOMContentLoaded', function () {
  main();
});