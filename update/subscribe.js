// Grab the querystring, removing question mark at the front and splitting on
// the ampersand.
var queryString = location.search.substring(1).split("&");

// The feed URL is the first component and always present.
var feedUrl = decodeURIComponent(queryString[0]);

function main(){
	document.getElementById("feedUrl").href=feedUrl;
}

document.addEventListener('DOMContentLoaded', function () {
  main();
});
